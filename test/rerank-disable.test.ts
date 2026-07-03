/**
 * Tests for rerank-disabling sentinel values.
 *
 * `QMD_RERANK_MODEL=none` (and similar sentinels) should make the resolved
 * rerank model empty so the query pipeline auto-skips reranking without
 * needing --no-rerank on every invocation and without pulling a GGUF.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import {
  resolveRerankModel,
  isRerankDisabled,
} from "../src/llm.js";

describe("isRerankDisabled", () => {
  test("treats disabled sentinels as true", () => {
    expect(isRerankDisabled("none")).toBe(true);
    expect(isRerankDisabled("disabled")).toBe(true);
    expect(isRerankDisabled("off")).toBe(true);
    expect(isRerankDisabled("false")).toBe(true);
    expect(isRerankDisabled("no")).toBe(true);
    expect(isRerankDisabled("")).toBe(true);
    expect(isRerankDisabled(undefined)).toBe(true);
    expect(isRerankDisabled(null)).toBe(true);
  });

  test("is case-insensitive and trims whitespace", () => {
    expect(isRerankDisabled("  None  ")).toBe(true);
    expect(isRerankDisabled("OFF")).toBe(true);
    expect(isRerankDisabled(" Disabled ")).toBe(true);
  });

  test("keeps real model URIs enabled", () => {
    expect(isRerankDisabled("hf:ggml-org/Qwen3-Reranker-0.6B-Q8_0-GGUF/x.gguf")).toBe(false);
    expect(isRerankDisabled("openai:bge-reranker")).toBe(false);
    expect(isRerankDisabled("local-model.gguf")).toBe(false);
  });
});

describe("resolveRerankModel disabled sentinel", () => {
  const previous = { QMD_RERANK_MODEL: process.env.QMD_RERANK_MODEL };
  beforeEach(() => { delete process.env.QMD_RERANK_MODEL; });
  afterEach(() => {
    if (previous.QMD_RERANK_MODEL === undefined) delete process.env.QMD_RERANK_MODEL;
    else process.env.QMD_RERANK_MODEL = previous.QMD_RERANK_MODEL;
  });

  test("returns empty string for QMD_RERANK_MODEL=none", () => {
    process.env.QMD_RERANK_MODEL = "none";
    expect(resolveRerankModel()).toBe("");
  });

  test("returns empty string for disabled/off/false/no", () => {
    for (const v of ["disabled", "off", "false", "no"]) {
      process.env.QMD_RERANK_MODEL = v;
      expect(resolveRerankModel()).toBe("");
    }
  });

  test("falls back to default GGUF when unset", () => {
    delete process.env.QMD_RERANK_MODEL;
    const resolved = resolveRerankModel();
    expect(resolved).toMatch(/Qwen3-Reranker/);
    expect(resolved.startsWith("hf:")).toBe(true);
  });

  test("keeps real model URIs as-is", () => {
    process.env.QMD_RERANK_MODEL = "openai:bge-reranker";
    expect(resolveRerankModel()).toBe("openai:bge-reranker");
  });

  test("config.rerank takes precedence over env", () => {
    process.env.QMD_RERANK_MODEL = "none";
    expect(resolveRerankModel({ rerank: "hf:some/reranker.gguf" })).toBe("hf:some/reranker.gguf");
  });

  test("config.rerank=none disables even if env points elsewhere", () => {
    process.env.QMD_RERANK_MODEL = "hf:foo/r.gguf";
    expect(resolveRerankModel({ rerank: "none" })).toBe("");
  });
});
