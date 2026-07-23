# OpenAI-Compatible Providers — Configuration Guide

QMDx supports routing embeddings, query expansion, and (optionally) reranking
to remote OpenAI-compatible HTTP endpoints instead of local GGUF models. This
lets you run QMDx without downloading any model weights — for example entirely
against [Gabia AI Hub](https://ai-hub-gabia.gabia.com) with `bge-m3` +
`minimax`.

> **Fork feature.** This is an addition over upstream `qmd`. The `openai:`
> model scheme and the rerank-disable sentinel are not in upstream.

---

## TL;DR — Gabia AI Hub (no local GGUF)

```sh
export QMDX_EMBED_MODEL="openai:bge-m3"
export QMDX_GENERATE_MODEL="openai:minimax"
export QMDX_RERANK_MODEL="none"
export QMDX_OPENAI_BASE_URL="https://ai-hub-gabia.gabia.com/v1"
export QMDX_OPENAI_API_KEY="sk-..."

qmdx embed -f          # index + embed via remote bge-m3
qmdx query "..."       # expand (minimax) + search (bge-m3), no rerank
```

No GGUF is downloaded. `qmdx query` returns RRF (BM25 + vector) ranked results.

---

## The three model roles

QMDx's search pipeline has three model roles. Each can be configured
independently via env var or `index.yml`:

| Role | Env var | Default (local GGUF) | OpenAI-compatible value | API endpoint |
|---|---|---|---|---|
| **embed** | `QMDX_EMBED_MODEL` | `embeddinggemma-300M` | `openai:<model>` | `POST /v1/embeddings` |
| **generate** | `QMDX_GENERATE_MODEL` | `qmd-query-expansion-1.7B` | `openai:<model>` | `POST /v1/chat/completions` |
| **rerank** | `QMDX_RERANK_MODEL` | `Qwen3-Reranker-0.6B` | `none` (disable) | _(no standard OpenAI API)_ |

A model URI starting with `openai:` activates the remote HTTP provider for
that role. The same `QMDX_OPENAI_BASE_URL` + `QMDX_OPENAI_API_KEY` are shared by
the embed and generate providers, so you only set them once.

> **Note:** Reranking has no standard OpenAI API. To skip it (the common choice
> when running fully remote), use `QMDX_RERANK_MODEL=none`. See
> [Disabling Reranking](#disabling-reranking) below.

---

## Environment variables

### Shared (required for any `openai:` provider)

| Variable | Purpose | Example |
|---|---|---|
| `QMDX_OPENAI_BASE_URL` | Base URL of the OpenAI-compatible API (trailing slashes trimmed) | `https://ai-hub-gabia.gabia.com/v1` |
| `QMDX_OPENAI_API_KEY` | Bearer token sent as `Authorization: Bearer <key>` | `sk-...` |

Both are required when **either** `QMDX_EMBED_MODEL` or `QMDX_GENERATE_MODEL`
uses the `openai:` scheme. An error is thrown at first use if either is missing.

### Embed provider

| Variable | Purpose | Default |
|---|---|---|
| `QMDX_EMBED_MODEL` | Embedding model; `openai:<name>` activates the HTTP provider | `embeddinggemma-300M` (local) |
| `QMDX_OPENAI_EMBED_BATCH_SIZE` | Max texts per `/embeddings` request | `64` |

### Generate provider

| Variable | Purpose | Default |
|---|---|---|
| `QMDX_GENERATE_MODEL` | Generate model; `openai:<name>` activates the HTTP provider | `qmd-query-expansion-1.7B` (local) |
| `QMDX_OPENAI_CHAT_MAX_TOKENS` | `max_tokens` for `/chat/completions` (expandQuery) | `2000` |

### Rerank

| Variable | Purpose | Default |
|---|---|---|
| `QMDX_RERANK_MODEL` | Rerank model; `none`/`disabled`/`off`/`false`/`no` disables reranking | `Qwen3-Reranker-0.6B` (local) |

---

## Persisting configuration in `index.yml`

Env vars override `index.yml`, but `index.yml` lets the choice persist across
sessions. Edit `~/.config/qmdx/index.yml` (or a project-local `.qmd/index.yaml`):

```yaml
models:
  embed: openai:bge-m3
  generate: openai:minimax
  rerank: none                    # skip reranking entirely
```

**Resolution precedence** (highest to lowest):
1. Env var (`QMDX_EMBED_MODEL` / `QMDX_GENERATE_MODEL` / `QMDX_RERANK_MODEL`)
2. `index.yml` `models.<role>`
3. Built-in default (local GGUF)

> **Gotcha:** `qmdx status`/`qmdx doctor` run without env vars will write the
> built-in defaults back into `index.yml`'s `models` block, which then shadows
> your env. If you configure via env only, either keep `models` out of
> `index.yml` or set the env var explicitly on every run. Pinning in
> `index.yml` (as above) avoids this.

---

## Embedding Provider (`openai:`)

Activates when `QMDX_EMBED_MODEL` uses the `openai:<model>` scheme. Calls
`POST {QMDX_OPENAI_BASE_URL}/embeddings` with `{ model, input: [...] }` and
maps the returned vectors into the SQLite vector table.

```sh
export QMDX_EMBED_MODEL="openai:bge-m3"
export QMDX_OPENAI_BASE_URL="https://ai-hub-gabia.gabia.com/v1"
export QMDX_OPENAI_API_KEY="sk-..."
# Optional: texts per /embeddings request (default 64)
# export QMDX_OPENAI_EMBED_BATCH_SIZE=64

qmdx embed -f          # (re-)embed using the remote model
qmdx vsearch "..."     # query embeddings also go through the provider
```

**Behavior notes:**
- Activates for embeddings only; query expansion and reranking keep their own
  configured models unless also switched.
- The vector table **auto-adapts to the returned dimensionality** (e.g.
  `bge-m3` = 1024d). Switching models requires `qmdx embed -f` to rebuild
  vectors (dimensions are not cross-compatible).
- Text chunking uses a token-count approximation (1 token ≈ 4 chars) since no
  local tokenizer is available; chunk boundaries are heuristic but respect the
  model's context-size limit.
- Embedding format: `bge-m3` and similar take raw text (no instruction
  prefix); the Qwen3-Embedding `Instruct: ... Query: ...` prefix is only
  applied to Qwen embedding models.

---

## Generate Provider (`openai:` chat completions)

Activates when `QMDX_GENERATE_MODEL` uses the `openai:<model>` scheme. Calls
`POST {QMDX_OPENAI_BASE_URL}/chat/completions` to expand the query into
`lex:`/`vec:`/`hyde:` variants before search.

```sh
export QMDX_GENERATE_MODEL="openai:minimax"
export QMDX_OPENAI_BASE_URL="https://ai-hub-gabia.gabia.com/v1"
export QMDX_OPENAI_API_KEY="sk-..."
# Optional: raise for reasoning models whose chain-of-thought eats the budget
# export QMDX_OPENAI_CHAT_MAX_TOKENS=4000

qmdx query "your query"        # expand (minimax) + search
```

**Behavior notes:**
- The local Qwen3 path uses a GBNF grammar to force the `lex:/vec:/hyde:` line
  format; the OpenAI path replaces it with prose instructions and parses the
  same line format from the response, so both providers are interchangeable.
- The Qwen3-specific `/no_think` token is **omitted** in the OpenAI prompt so
  generic chat models (`minimax`, `gpt`, `gemini`, ...) aren't confused.
- **Reasoning models** (e.g. `minimax`) put chain-of-thought in
  `reasoning_content` and the final answer in `content`. Only `content` is
  read, but a generous `max_tokens` is required or the request ends with
  `finish_reason=length` and `content=null`. Raise
  `QMDX_OPENAI_CHAT_MAX_TOKENS` if you see "returned no content" errors.
- On any error the expansion falls back to the original query, so search still
  returns results.

---

## Disabling Reranking

Reranking is **on by default** and pulls the local `Qwen3-Reranker` GGUF
(~600MB) on first use. There is no standard OpenAI rerank API, so when running
fully against remote providers you typically disable it.

Set the rerank model to a sentinel value:

```sh
export QMDX_RERANK_MODEL="none"   # also accepts: disabled / off / false / no
qmdx query "..."                # no --no-rerank needed, no GGUF download
```

Or pin in `index.yml`:

```yaml
models:
  rerank: none
```

With reranking disabled, `qmdx query` returns results ranked by **RRF only**
(BM25 + vector scores) — fast and dependency-free, at the cost of the final
relevance pass. You can still force a one-off skip with `--no-rerank` regardless
of configuration.

---

## Running against Ollama (local)

[Ollama](https://ollama.com) exposes an OpenAI-compatible API at
`http://127.0.0.1:11434/v1`. QMDx can use it as the embed and/or generate
provider — **but not as the rerank provider.**

> **Reranking is local-only.** There is no standard OpenAI rerank API, and
> Ollama does not host a working rerank endpoint. The dedicated
> `dengcao/Qwen3-Reranker-0.6B` chat model sold as a "reranker" on Ollama is
> [broken as a reranker](https://ollama.com/dengcao/Qwen3-Reranker-0.6B) — it
> does not emit `yes`/`no` logits through `/v1/chat/completions`, so it cannot
> produce usable relevance scores (see the dengcao README's own warning that
> "as of 2025-06-11, Ollama does not yet support rerank models"). Qwen3-Reranker
> only works as a reranker when loaded as GGUF directly by `node-llama-cpp`
> (the QMDx default path), which reads the `yes`/`no` logits via the native
> `createRankingContext` API Ollama does not expose.
>
> Accept this tradeoff: when routing to Ollama, **disable reranking** and rely on
> RRF (BM25 + vector) fusion alone. See
> [Disabling Reranking](#disabling-reranking).

### Quick start with Ollama

```sh
# 1. Pull models in Ollama
ollama pull bge-m3                  # embedding model (1024d)
ollama pull qwen3                   # generate model for query expansion
# (do NOT bother pulling a Qwen3-Reranker chat model — it won't work as a rerank
#  through the OpenAI endpoint; see the note above)

# 2. Point QMDx at Ollama's OpenAI-compatible endpoint and disable rerank
export QMDX_EMBED_MODEL="openai:bge-m3"
export QMDX_GENERATE_MODEL="openai:qwen3"
export QMDX_RERANK_MODEL="none"                    # rerank is local-only
export QMDX_OPENAI_BASE_URL="http://127.0.0.1:11434/v1"
export QMDX_OPENAI_API_KEY="any_key"              # Ollama ignores the key value

qmdx embed -f          # index + embed via local Ollama bge-m3
qmdx query "..."       # expand (qwen3) + search (bge-m3), RRF-only (no rerank)
qmdx vsearch "..."      # vector-only, skips rerank automatically
```

**Ollama specifics:**
- The API key is ignored by Ollama; any non-empty string works (QMDx still
  requires the env var to be set when any `openai:` model is configured).
- There is no per-provider API key — the embed and generate providers share
  the same `QMDX_OPENAI_BASE_URL` + `QMDX_OPENAI_API_KEY`.
- The vector table **auto-adapts to the returned dimensionality** (e.g.
  `bge-m3` = 1024d); switching models requires `qmdx embed -f` to rebuild
  vectors.

### What if I really want reranking?

Run the **local** GGUF reranker (the QMDx default) instead of routing to Ollama:
leave `QMDX_RERANK_MODEL` unset (or point it at the local GGUF URI) and ensure
`node-llama-cpp` can load the model — `qmdx doctor` will report whether the
local llama backend initializes. You can mix: use Ollama for **embed +
generate** and the **local** GGUF for **rerank**. This downloads one ~600MB
GGUF and requires a working `node-llama-cpp` backend on the host:

```sh
export QMDX_EMBED_MODEL="openai:bge-m3"
export QMDX_GENERATE_MODEL="openai:qwen3"
# QMDX_RERANK_MODEL stays unset → default local Qwen3-Reranker GGUF is used
export QMDX_OPENAI_BASE_URL="http://127.0.0.1:11434/v1"
export QMDX_OPENAI_API_KEY="any_key"
qmdx query "..."   # expand(qwen3@ollama) + search(bge-m3@ollama) + rerank(local GGUF)
```

---

## End-to-end verification (Gabia AI Hub)

Verified against `https://ai-hub-gabia.gabia.com/v1` with `bge-m3` +
`minimax`:

```sh
# 1. Index a small markdown collection
mkdir -p /tmp/qmdx-test && cd /tmp/qmdx-test
echo "# Embedding Models\nbge-m3 produces 1024-dimensional vectors..." > note.md
qmdx collection add . --name test

# 2. Embed via remote bge-m3 (no GGUF download)
QMDX_EMBED_MODEL=openai:bge-m3 \
QMDX_OPENAI_BASE_URL=https://ai-hub-gabia.gabia.com/v1 \
QMDX_OPENAI_API_KEY=sk-... \
qmdx embed -f
# → "Embedded 1 chunks from 1 documents in 0s", vector table float[1024]

# 3. Query via remote minimax (expand) + bge-m3 (search), no rerank
QMDX_EMBED_MODEL=openai:bge-m3 \
QMDX_GENERATE_MODEL=openai:minimax \
QMDX_RERANK_MODEL=none \
QMDX_OPENAI_BASE_URL=https://ai-hub-gabia.gabia.com/v1 \
QMDX_OPENAI_API_KEY=sk-... \
qmdx query "multilingual embedding dimension"
# → Expands to ~8-11 queries, ranks note.md at 100%
```

## Available models on Gabia AI Hub (as of testing)

`GET /v1/models` returns (notable ones for QMDx):

- **Embedding:** `bge-m3` (1024d)
- **Chat (generate):** `minimax` (reasoning), `qwen3`, `qwen3-plus`, `gpt-5`,
  `gpt-5-mini`, `gemini-3-pro`, `claude-sonnet`, `kimi`, ...
- **Rerank:** none (use `QMDX_RERANK_MODEL=none`)

Check the current list with:

```sh
curl -s https://ai-hub-gabia.gabia.com/v1/models \
  -H "Authorization: Bearer sk-..." | jq '.data[].id'
```
