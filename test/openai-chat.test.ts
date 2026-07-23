/**
 * Unit tests for the OpenAI-compatible chat-completion provider
 * (src/openai-chat.ts) and the shared expand-query parsing logic.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isOpenAIChatModel,
  parseOpenAIChatModel,
  resolveOpenAIChatConfig,
  openaiChatComplete,
  buildExpandQueryPrompt,
} from "../src/openai-chat.js";
import { parseExpandedQueryLines } from "../src/llm.js";

describe("isOpenAIChatModel", () => {
  test("matches openai: scheme", () => {
    expect(isOpenAIChatModel("openai:minimax")).toBe(true);
    expect(isOpenAIChatModel("openai:gpt-4o-mini")).toBe(true);
  });
  test("rejects non-openai uris", () => {
    expect(isOpenAIChatModel("hf:tobil/qmd-query-expansion-1.7B-gguf/x.gguf")).toBe(false);
    expect(isOpenAIChatModel(undefined)).toBe(false);
    expect(isOpenAIChatModel("")).toBe(false);
  });
});

test("parseOpenAIChatModel strips scheme", () => {
  expect(parseOpenAIChatModel("openai:minimax")).toBe("minimax");
  expect(() => parseOpenAIChatModel("hf:foo")).toThrow(/Not an OpenAI chat model/);
});

describe("resolveOpenAIChatConfig", () => {
  beforeEach(() => {
    process.env.QMDX_OPENAI_BASE_URL = "https://example.test/v1";
    process.env.QMDX_OPENAI_API_KEY = "sk-test";
  });
  afterEach(() => {
    delete process.env.QMDX_OPENAI_BASE_URL;
    delete process.env.QMDX_OPENAI_API_KEY;
  });

  test("resolves model + shared base config", () => {
    const cfg = resolveOpenAIChatConfig("openai:minimax");
    expect(cfg.model).toBe("minimax");
    expect(cfg.baseUrl).toBe("https://example.test/v1");
    expect(cfg.apiKey).toBe("sk-test");
  });

  test("throws when base url missing", () => {
    delete process.env.QMDX_OPENAI_BASE_URL;
    expect(() => resolveOpenAIChatConfig("openai:minimax")).toThrow(/QMDX_OPENAI_BASE_URL/);
  });
});

describe("buildExpandQueryPrompt", () => {
  test("uses system+user roles and omits Qwen3 /no_think token", () => {
    const msgs = buildExpandQueryPrompt("how to make kimchi stew");
    expect(msgs).toHaveLength(2);
    expect(msgs[0]!.role).toBe("system");
    expect(msgs[1]!.role).toBe("user");
    expect(msgs[1]!.content).toContain("how to make kimchi stew");
    // The /no_think token is Qwen3-specific and must NOT leak into the
    // generic OpenAI prompt — it confuses non-Qwen chat models.
    expect(msgs[0]!.content).not.toContain("/no_think");
    expect(msgs[1]!.content).not.toContain("/no_think");
  });

  test("includes intent line when provided", () => {
    const msgs = buildExpandQueryPrompt("rag", "looking for architecture diagrams");
    expect(msgs[1]!.content).toContain("Query intent: looking for architecture diagrams");
  });
});

describe("openaiChatComplete", () => {
  const cfg = { model: "minimax", baseUrl: "https://example.test/v1", apiKey: "sk-test" };

  test("POSTs to /chat/completions and returns assistant content", async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("https://example.test/v1/chat/completions");
      const body = JSON.parse(init.body as string) as { model: string; messages: unknown[]; max_tokens: number };
      expect(body.model).toBe("minimax");
      expect(body.messages).toHaveLength(1);
      expect(body.max_tokens).toBe(2000);
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "lex: a\nvec: b" }, finish_reason: "stop" }],
        }),
        { status: 200 }
      );
    });
    const content = await openaiChatComplete(cfg, {
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 2000,
      fetch: fetchMock as typeof fetch,
    });
    expect(content).toBe("lex: a\nvec: b");
  });

  test("ignores reasoning_content and reads only content", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{
            message: { content: "lex: final answer", reasoning_content: "thinking..." },
            finish_reason: "stop",
          }],
        }),
        { status: 200 }
      )
    );
    const content = await openaiChatComplete(cfg, {
      messages: [{ role: "user", content: "hi" }],
      fetch: fetchMock as typeof fetch,
    });
    expect(content).toBe("lex: final answer");
  });

  test("throws with finish_reason hint when content is null (reasoning starved)", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: null }, finish_reason: "length" }] }),
        { status: 200 }
      )
    );
    await expect(
      openaiChatComplete(cfg, { messages: [{ role: "user", content: "hi" }], fetch: fetchMock as typeof fetch })
    ).rejects.toThrow(/no content.*finish_reason=length.*QMDX_OPENAI_CHAT_MAX_TOKENS/s);
  });

  test("throws on non-2xx with body snippet", async () => {
    const fetchMock = vi.fn(async () => new Response('{"error":"bad"}', { status: 401 }));
    await expect(
      openaiChatComplete(cfg, { messages: [{ role: "user", content: "hi" }], fetch: fetchMock as typeof fetch })
    ).rejects.toThrow(/HTTP 401/);
  });
});

describe("parseExpandedQueryLines", () => {
  test("parses lex/vec/hyde lines", () => {
    const text = "lex: kimchi stew recipe\nvec: korean stew\nhyde: a stew with aged kimchi";
    const result = parseExpandedQueryLines(text, "stew", true);
    expect(result).toEqual([
      { type: "lex", text: "kimchi stew recipe" },
      { type: "vec", text: "korean stew" },
      { type: "hyde", text: "a stew with aged kimchi" },
    ]);
  });

  test("drops lines without a query term (when query terms exist)", () => {
    const text = "lex: kimchi recipe\nlex: unrelated thing";
    const result = parseExpandedQueryLines(text, "kimchi", true);
    expect(result).toHaveLength(1);
    expect(result[0]!.text).toBe("kimchi recipe");
  });

  test("filters out lex entries when includeLexical=false", () => {
    const text = "lex: kimchi stew\nvec: korean stew";
    const result = parseExpandedQueryLines(text, "stew", false);
    expect(result).toEqual([{ type: "vec", text: "korean stew" }]);
  });

  test("falls back when no lines parse", () => {
    const text = "garbage response with no colons";
    const result = parseExpandedQueryLines(text, "query", true);
    expect(result).toContainEqual({ type: "hyde", text: "Information about query" });
    expect(result).toContainEqual({ type: "lex", text: "query" });
    expect(result).toContainEqual({ type: "vec", text: "query" });
  });
});
