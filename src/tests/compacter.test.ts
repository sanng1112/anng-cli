import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shouldCompactContext, type CompactionDecision } from "../session/compacter";

describe("shouldCompactContext", () => {
  it("returns compact=true when estimated tokens exceed threshold", () => {
    const hugeText = "function test() { return 1; } ".repeat(4000);
    const decision = shouldCompactContext({
      messages: [{ role: "user", content: hugeText }],
      model: "gpt-4",
      threshold: 10_000,
    });
    assert.strictEqual(decision.shouldCompact, true);
    assert.ok(decision.estimatedTokens > 10_000);
  });

  it("returns compact=false when under threshold", () => {
    const decision = shouldCompactContext({
      messages: [{ role: "user", content: "Hello world" }],
      model: "gpt-4",
      threshold: 128_000,
    });
    assert.strictEqual(decision.shouldCompact, false);
  });

  it("uses 512k threshold for deepseek models via getCompactThreshold", () => {
    const decision = shouldCompactContext({
      messages: [{ role: "user", content: "test ".repeat(5000) }],
      model: "deepseek-v4-pro",
      threshold: 512_000,
    });
    assert.strictEqual(decision.shouldCompact, false);
  });

  it("marks compacted messages range correctly", () => {
    const messages = Array.from({ length: 20 }, (_, i) => ({
      role: "user" as const,
      content: `Message ${i} `.repeat(50),
    }));
    const decision = shouldCompactContext({
      messages,
      model: "gpt-4",
      threshold: 1000,
    });
    assert.strictEqual(decision.shouldCompact, true);
    assert.ok(decision.compactUpToIndex !== undefined && decision.compactUpToIndex > 0);
    assert.ok(decision.keepFromIndex !== undefined && decision.keepFromIndex > decision.compactUpToIndex);
  });
});
