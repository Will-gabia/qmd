/**
 * OpenAI-compatible embedding provider.
 *
 * Activated when the active embed model URI uses the `openai:` scheme, e.g.
 *   QMD_EMBED_MODEL=openai:bge-m3
 *   QMD_OPENAI_BASE_URL=https://ai-hub-gabia.gabia.com/v1
 *   QMD_OPENAI_API_KEY=sk-...
 *
 * Calls the standard POST {baseUrl}/embeddings endpoint and returns vectors
 * the same shape LlamaCpp.embed/embedBatch produce, so the rest of the
 * pipeline (vector table, vsearch, rerank) is provider-agnostic.
 */

/** Embedding result, mirroring {@link import("./llm.js").EmbeddingResult}. */
export interface OpenAIEmbeddingResult {
  embedding: number[];
  model: string;
}

export interface OpenAIEmbedOptions {
  /** Model label to record on results; defaults to the parsed model. */
  model?: string;
}

/** True when a model URI targets the OpenAI-compatible HTTP provider. */
export function isOpenAIEmbedModel(modelUri: string | undefined | null): boolean {
  return !!modelUri && modelUri.startsWith("openai:");
}

/** Parse an `openai:<model>` URI into the model name. */
export function parseOpenAIEmbedModel(modelUri: string): string {
  if (!isOpenAIEmbedModel(modelUri)) {
    throw new Error(`Not an OpenAI embed model URI: ${modelUri}`);
  }
  return modelUri.slice("openai:".length);
}

export interface OpenAIEmbedConfig {
  model: string;
  baseUrl: string;
  apiKey: string;
  /** Per-request batch size; the API rejects overly large `input` arrays. */
  batchSize: number;
}

/** Resolve provider config from env + model URI. Throws if incomplete. */
export function resolveOpenAIEmbedConfig(modelUri: string): OpenAIEmbedConfig {
  const model = parseOpenAIEmbedModel(modelUri);
  const baseUrl = (process.env.QMD_OPENAI_BASE_URL ?? "").trim().replace(/\/+$/, "");
  const apiKey = (process.env.QMD_OPENAI_API_KEY ?? "").trim();
  if (!baseUrl) {
    throw new Error(
      "QMD_OPENAI_BASE_URL is required for openai: embed models (e.g. https://host/v1)"
    );
  }
  if (!apiKey) {
    throw new Error("QMD_OPENAI_API_KEY is required for openai: embed models");
  }
  const batchSize = parseInt(process.env.QMD_OPENAI_EMBED_BATCH_SIZE ?? "64", 10) || 64;
  return { model, baseUrl, apiKey, batchSize };
}

/**
 * Embed a batch of texts via an OpenAI-compatible endpoint.
 *
 * Splits into sub-batches of `config.batchSize`, preserves input order, and
 * returns one result per input text (null entries on failure, matching the
 * LlamaCpp.embedBatch contract).
 *
 * Exported separately so it can be unit-tested with a fetch mock.
 */
export async function openaiEmbed(
  texts: string[],
  config: OpenAIEmbedConfig,
  options?: { signal?: AbortSignal; fetch?: typeof fetch }
): Promise<OpenAIEmbeddingResult[]> {
  if (texts.length === 0) return [];

  const fetchFn = options?.fetch ?? fetch;
  const results: OpenAIEmbeddingResult[] = new Array(texts.length);

  for (let start = 0; start < texts.length; start += config.batchSize) {
    const slice = texts.slice(start, start + config.batchSize);
    const body = JSON.stringify({ model: config.model, input: slice });
    const url = `${config.baseUrl}/embeddings`;

    let res: Response;
    try {
      res = await fetchFn(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body,
        signal: options?.signal,
      });
    } catch (err) {
      throw new Error(`OpenAI embed request to ${url} failed: ${(err as Error).message}`);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `OpenAI embed ${url} returned HTTP ${res.status}: ${text.slice(0, 500)}`
      );
    }

    const json = (await res.json()) as { data?: { embedding?: number[] }[] };
    const data = json.data;
    if (!Array.isArray(data) || data.length !== slice.length) {
      throw new Error(
        `OpenAI embed ${url} returned malformed data: expected ${slice.length} vectors, got ${
          Array.isArray(data) ? data.length : "non-array"
        }`
      );
    }

    for (let i = 0; i < slice.length; i++) {
      const vec = data[i]!.embedding;
      if (!Array.isArray(vec)) {
        throw new Error(`OpenAI embed ${url} returned no embedding at index ${start + i}`);
      }
      results[start + i] = { embedding: vec, model: config.model };
    }
  }

  return results;
}
