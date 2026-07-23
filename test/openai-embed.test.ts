/**
 * Unit tests for the OpenAI-compatible embedding provider (src/openai-embed.ts).
 *
 * Uses a fetch mock — no network. A separate live integration check runs the
 * real CLI against the configured endpoint (see integration section below).
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isOpenAIEmbedModel,
  parseOpenAIEmbedModel,
  resolveOpenAIEmbedConfig,
  openaiEmbed,
} from "../src/openai-embed.js";

describe("isOpenAIEmbedModel", () => {
  test("matches openai: scheme", () => {
    expect(isOpenAIEmbedModel("openai:bge-m3")).toBe(true);
    expect(isOpenAIEmbedModel("openai:text-embedding-3-small")).toBe(true);
  });

  test("rejects other schemes", () => {
    expect(isOpenAIEmbedModel("hf:ggml-org/embeddinggemma-300M-GGUF/x.gguf")).toBe(false);
    expect(isOpenAIEmbedModel(undefined)).toBe(false);
    expect(isOpenAIEmbedModel(null)).toBe(false);
    expect(isOpenAIEmbedModel("")).toBe(false);
  });
});

test("parseOpenAIEmbedModel strips the scheme", () => {
  expect(parseOpenAIEmbedModel("openai:bge-m3")).toBe("bge-m3");
  expect(() => parseOpenAIEmbedModel("hf:foo")).toThrow(/Not an OpenAI embed model/);
});

describe("resolveOpenAIEmbedConfig", () => {
  beforeEach(() => {
    process.env.QMDX_OPENAI_BASE_URL = "https://example.test/v1";
    process.env.QMDX_OPENAI_API_KEY = "sk-test";
    delete process.env.QMDX_OPENAI_EMBED_BATCH_SIZE;
  });
  afterEach(() => {
    delete process.env.QMDX_OPENAI_BASE_URL;
    delete process.env.QMDX_OPENAI_API_KEY;
    delete process.env.QMDX_OPENAI_EMBED_BATCH_SIZE;
  });

  test("reads model, base url, key, and default batch size", () => {
    const cfg = resolveOpenAIEmbedConfig("openai:bge-m3");
    expect(cfg.model).toBe("bge-m3");
    expect(cfg.baseUrl).toBe("https://example.test/v1");
    expect(cfg.apiKey).toBe("sk-test");
    expect(cfg.batchSize).toBe(64);
  });

  test("trims trailing slashes from baseUrl", () => {
    process.env.QMDX_OPENAI_BASE_URL = "https://example.test/v1///";
    expect(resolveOpenAIEmbedConfig("openai:bge-m3").baseUrl).toBe("https://example.test/v1");
  });

  test("honors QMDX_OPENAI_EMBED_BATCH_SIZE", () => {
    process.env.QMDX_OPENAI_EMBED_BATCH_SIZE = "8";
    expect(resolveOpenAIEmbedConfig("openai:bge-m3").batchSize).toBe(8);
  });

  test("throws when base url is missing", () => {
    delete process.env.QMDX_OPENAI_BASE_URL;
    expect(() => resolveOpenAIEmbedConfig("openai:bge-m3")).toThrow(/QMDX_OPENAI_BASE_URL/);
  });

  test("throws when api key is missing", () => {
    delete process.env.QMDX_OPENAI_API_KEY;
    expect(() => resolveOpenAIEmbedConfig("openai:bge-m3")).toThrow(/QMDX_OPENAI_API_KEY/);
  });
});

describe("openaiEmbed", () => {
  const cfg = {
    model: "bge-m3",
    baseUrl: "https://example.test/v1",
    apiKey: "sk-test",
    batchSize: 64,
  };

  test("POSTs to /embeddings and maps vectors in order", async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("https://example.test/v1/embeddings");
      expect(init.method).toBe("POST");
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
      const body = JSON.parse(init.body as string) as { model: string; input: string[] };
      expect(body.model).toBe("bge-m3");
      expect(body.input).toEqual(["alpha", "beta"]);
      return new Response(
        JSON.stringify({
          data: [
            { embedding: [0.1, 0.2] },
            { embedding: [0.3, 0.4] },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });

    const results = await openaiEmbed(["alpha", "beta"], cfg, { fetch: fetchMock as typeof fetch });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(2);
    expect(results[0]!.embedding).toEqual([0.1, 0.2]);
    expect(results[0]!.model).toBe("bge-m3");
    expect(results[1]!.embedding).toEqual([0.3, 0.4]);
  });

  test("returns [] for empty input without calling fetch", async () => {
    const fetchMock = vi.fn();
    const results = await openaiEmbed([], cfg, { fetch: fetchMock as typeof fetch });
    expect(results).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("splits into sub-batches per batchSize", async () => {
    const cfg2 = { ...cfg, batchSize: 2 };
    let calls = 0;
    const seen: string[][] = [];
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      calls++;
      const body = JSON.parse(init.body as string) as { input: string[] };
      seen.push(body.input);
      return new Response(
        JSON.stringify({ data: body.input.map(() => ({ embedding: [1] })) }),
        { status: 200 }
      );
    });
    const results = await openaiEmbed(["a", "b", "c", "d", "e"], cfg2, {
      fetch: fetchMock as typeof fetch,
    });
    expect(calls).toBe(3);
    expect(seen).toEqual([["a", "b"], ["c", "d"], ["e"]]);
    expect(results).toHaveLength(5);
    expect(results.every(r => r!.embedding.length === 1)).toBe(true);
  });

  test("throws on non-2xx with response body snippet", async () => {
    const fetchMock = vi.fn(async () =>
      new Response('{"error":"bad model"}', { status: 400 })
    );
    await expect(
      openaiEmbed(["x"], cfg, { fetch: fetchMock as typeof fetch })
    ).rejects.toThrow(/HTTP 400/);
  });

  test("throws on malformed data array", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ embedding: [1] }] }), { status: 200 })
    );
    // 2 inputs, only 1 vector returned
    await expect(
      openaiEmbed(["a", "b"], cfg, { fetch: fetchMock as typeof fetch })
    ).rejects.toThrow(/malformed data/);
  });
});
