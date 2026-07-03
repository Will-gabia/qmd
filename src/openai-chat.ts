/**
 * OpenAI-compatible chat-completion provider.
 *
 * Activated when the active generate model URI uses the `openai:` scheme, e.g.
 *   QMD_GENERATE_MODEL=openai:minimax
 *   QMD_OPENAI_BASE_URL=https://ai-hub-gabia.gabia.com/v1
 *   QMD_OPENAI_API_KEY=sk-...
 *
 * Reuses the same base URL + key as the embedding provider. Calls the standard
 * POST {baseUrl}/chat/completions endpoint and returns the assistant message
 * content. Used by expandQuery() to produce lex/vec/hyde query variants.
 */

import type { OpenAIBaseConfig } from "./openai-embed.js";
import { resolveOpenAIBaseConfig } from "./openai-embed.js";

export interface OpenAIChatConfig {
  model: string;
  baseUrl: string;
  apiKey: string;
}

/** True when a generate model URI targets the OpenAI-compatible HTTP provider. */
export function isOpenAIChatModel(modelUri: string | undefined | null): boolean {
  return !!modelUri && modelUri.startsWith("openai:");
}

/** Parse an `openai:<model>` URI into the model name. */
export function parseOpenAIChatModel(modelUri: string): string {
  if (!isOpenAIChatModel(modelUri)) {
    throw new Error(`Not an OpenAI chat model URI: ${modelUri}`);
  }
  return modelUri.slice("openai:".length);
}

/** Resolve chat provider config from env + model URI. Throws if incomplete. */
export function resolveOpenAIChatConfig(modelUri: string): OpenAIChatConfig {
  const model = parseOpenAIChatModel(modelUri);
  const base: OpenAIBaseConfig = resolveOpenAIBaseConfig();
  return { model, ...base };
}

export interface OpenAIChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenAIChatOptions {
  messages: OpenAIChatMessage[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  fetch?: typeof fetch;
}

/**
 * Call POST {baseUrl}/chat/completions and return the assistant content string.
 *
 * Reasoning models (e.g. minimax) put chain-of-thought in `reasoning_content`
 * and the final answer in `content`; we read only `content` and require the
 * caller to set a large enough maxTokens so reasoning doesn't starve the
 * answer (the request returns finish_reason "length" with content=null when
 * the budget is exhausted before the answer starts).
 */
export async function openaiChatComplete(
  config: OpenAIChatConfig,
  options: OpenAIChatOptions
): Promise<string> {
  const fetchFn = options.fetch ?? fetch;
  const url = `${config.baseUrl}/chat/completions`;
  const body = JSON.stringify({
    model: config.model,
    messages: options.messages,
    max_tokens: options.maxTokens ?? 1000,
    temperature: options.temperature ?? 0.7,
  });

  let res: Response;
  try {
    res = await fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body,
      signal: options.signal,
    });
  } catch (err) {
    throw new Error(`OpenAI chat request to ${url} failed: ${(err as Error).message}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI chat ${url} returned HTTP ${res.status}: ${text.slice(0, 500)}`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  };
  const choice = json.choices?.[0];
  const content = choice?.message?.content;
  if (!content) {
    const reason = choice?.finish_reason ?? "unknown";
    throw new Error(
      `OpenAI chat ${url} returned no content (finish_reason=${reason}). ` +
        `For reasoning models, raise QMD_OPENAI_CHAT_MAX_TOKENS (default 2000).`
    );
  }
  return content;
}

/**
 * Build the expand-query prompt for an OpenAI-compatible chat model.
 *
 * Unlike the local Qwen3 path (which uses a GBNF grammar to force the
 * lex/vec/hyde format), we instruct the model in prose and parse the same
 * line format from the response. The `/no_think` token is Qwen3-specific and
 * is omitted so generic chat models (minimax, gpt, gemini, ...) aren't
 * confused by it.
 */
export function buildExpandQueryPrompt(query: string, intent?: string): OpenAIChatMessage[] {
  const intentLine = intent ? `\nQuery intent: ${intent}` : "";
  return [
    {
      role: "system",
      content:
        "You expand search queries for a hybrid retrieval system. Reply with multiple " +
        "expansions, one per line, using exactly this format:\n" +
        "lex: <keyword-focused variant>\n" +
        "vec: <semantic/paraphrase variant>\n" +
        "hyde: <a hypothetical document snippet that would answer the query>\n" +
        "Provide several of each type, each on its own line. Output ONLY the lines, " +
        "no preamble, no markdown, no code fences.",
    },
    {
      role: "user",
      content: `Expand this search query: ${query}${intentLine}`,
    },
  ];
}
