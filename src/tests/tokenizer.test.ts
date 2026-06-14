import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { countTokens, countMessagesTokens, getCompactThreshold } from "../common/tokenizer";

describe("countTokens", () => {
  it("counts tokens for standard code text within expected range", () => {
    const text = "function helloWorld() { return 'hello'; }";
    const count = countTokens(text);
    assert.ok(count > 5 && count < 15, `Expected ~10 tokens, got ${count}`);
  });

  it("returns 0 for empty string", () => {
    assert.strictEqual(countTokens(""), 0);
  });

  it("returns higher count for longer text", () => {
    const short = countTokens("hi");
    const long = countTokens("hi ".repeat(1000));
    assert.ok(long > short * 10, "Longer text should have proportionally more tokens");
  });
});

describe("countMessagesTokens", () => {
  it("estimates tokens for a list of messages", () => {
    const messages = [
      { role: "system", content: "You are a coding assistant." },
      { role: "user", content: "Fix the bug in src/main.ts" },
      { role: "assistant", content: "I'll look at the file first." },
    ];
    const count = countMessagesTokens(messages);
    assert.ok(count > 15 && count < 100, `Expected reasonable token count, got ${count}`);
  });

  it("returns 0 for empty array", () => {
    assert.strictEqual(countMessagesTokens([]), 0);
  });
});

describe("getCompactThreshold", () => {
  it("returns 48k for deepseek models", () => {
    assert.strictEqual(getCompactThreshold("deepseek-v4-pro"), 48 * 1024);
    assert.strictEqual(getCompactThreshold("deepseek-v4-flash"), 48 * 1024);
  });

  it("returns 32k for unknown models", () => {
    assert.strictEqual(getCompactThreshold("gpt-4"), 32 * 1024);
    assert.strictEqual(getCompactThreshold(""), 32 * 1024);
  });
});
