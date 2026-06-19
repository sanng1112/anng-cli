import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEEPSEEK_V4_MODELS,
  NON_MULTIMODAL_MODELS,
  defaultsToThinkingMode,
  supportsMultimodal,
} from "../common/model-capabilities";

describe("DEEPSEEK_V4_MODELS", () => {
  it("contains deepseek-v4-flash and deepseek-v4-pro", () => {
    assert.equal(DEEPSEEK_V4_MODELS.has("deepseek-v4-flash"), true);
    assert.equal(DEEPSEEK_V4_MODELS.has("deepseek-v4-pro"), true);
  });

  it("includes free variants", () => {
    assert.equal(DEEPSEEK_V4_MODELS.has("deepseek-v4-flash-free"), true);
    assert.equal(DEEPSEEK_V4_MODELS.has("deepseek-v4-pro-free"), true);
  });

  it("does not contain other models", () => {
    assert.equal(DEEPSEEK_V4_MODELS.has("gpt-4"), false);
    assert.equal(DEEPSEEK_V4_MODELS.has("gemini-2.5-flash"), false);
  });
});

describe("NON_MULTIMODAL_MODELS", () => {
  it("includes deepseek models and excludes gemini", () => {
    assert.equal(NON_MULTIMODAL_MODELS.has("deepseek-v4-pro"), true);
    assert.equal(NON_MULTIMODAL_MODELS.has("deepseek-chat"), true);
    assert.equal(NON_MULTIMODAL_MODELS.has("gemini-2.5-flash"), false);
  });
});

describe("defaultsToThinkingMode", () => {
  it("returns true for deepseek V4 models", () => {
    assert.equal(defaultsToThinkingMode("deepseek-v4-pro"), true);
    assert.equal(defaultsToThinkingMode("deepseek-v4-flash"), true);
    assert.equal(defaultsToThinkingMode("deepseek-v4-flash-free"), true);
    assert.equal(defaultsToThinkingMode("deepseek-v4-pro-free"), true);
  });

  it("returns false for non-V4 models", () => {
    assert.equal(defaultsToThinkingMode("deepseek-chat"), false);
    assert.equal(defaultsToThinkingMode("gemini-2.5-flash"), false);
    assert.equal(defaultsToThinkingMode("gpt-4"), false);
  });
});

describe("supportsMultimodal", () => {
  it("returns false for non-multimodal models", () => {
    assert.equal(supportsMultimodal("deepseek-v4-pro"), false);
    assert.equal(supportsMultimodal("deepseek-reasoner"), false);
  });

  it("returns true for multimodal models", () => {
    assert.equal(supportsMultimodal("gemini-2.5-flash"), true);
    assert.equal(supportsMultimodal("gpt-4o"), true);
  });

  it("trims whitespace from model name", () => {
    assert.equal(supportsMultimodal("  deepseek-chat  "), false);
  });
});
