import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { KeyRotator } from "../common/key-rotator";

describe("KeyRotator", () => {
  it("parses comma-separated keys and rotates", () => {
    const rotator = new KeyRotator("key1, key2,key3");
    assert.strictEqual(rotator.getCurrentKey(), "key1");

    rotator.rotate();
    assert.strictEqual(rotator.getCurrentKey(), "key2");

    rotator.rotate();
    assert.strictEqual(rotator.getCurrentKey(), "key3");

    rotator.rotate();
    assert.strictEqual(rotator.getCurrentKey(), "key1"); // loops back
  });

  it("handles single key", () => {
    const rotator = new KeyRotator("single_key");
    assert.strictEqual(rotator.getCurrentKey(), "single_key");
    rotator.rotate();
    assert.strictEqual(rotator.getCurrentKey(), "single_key");
  });

  it("handles empty string", () => {
    const rotator = new KeyRotator("");
    assert.strictEqual(rotator.getCurrentKey(), "");
  });

  it("handles whitespace-only string", () => {
    const rotator = new KeyRotator("  ,  , ");
    assert.strictEqual(rotator.getCurrentKey(), "");
  });

  it("getKeyCount returns correct count", () => {
    assert.strictEqual(new KeyRotator("a,b,c").getKeyCount(), 3);
    assert.strictEqual(new KeyRotator("single").getKeyCount(), 1);
    assert.strictEqual(new KeyRotator("").getKeyCount(), 1);
  });

  it("reset returns to first key", () => {
    const rotator = new KeyRotator("a,b,c");
    rotator.rotate();
    rotator.rotate();
    assert.strictEqual(rotator.getCurrentKey(), "c");
    rotator.reset();
    assert.strictEqual(rotator.getCurrentKey(), "a");
  });
});
