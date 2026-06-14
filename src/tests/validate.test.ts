import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { semanticBoolean, semanticInteger, executeValidatedTool } from "../common/validate";
import type { ToolExecutionContext } from "../tools/executor";

const noopContext: ToolExecutionContext = {
  sessionId: "test-session",
  projectRoot: "/tmp/test",
  toolCall: { id: "call-1", type: "function", function: { name: "test", arguments: "{}" } },
};

describe("semanticBoolean", () => {
  it("converts 'true' string to boolean true", () => {
    const schema = z.object({ flag: semanticBoolean(false) });
    const result = schema.parse({ flag: "true" });
    assert.equal(result.flag, true);
  });

  it("converts 'false' string to boolean false", () => {
    const schema = z.object({ flag: semanticBoolean(true) });
    const result = schema.parse({ flag: "false" });
    assert.equal(result.flag, false);
  });

  it("passes through boolean values", () => {
    const schema = z.object({ flag: semanticBoolean(false) });
    assert.equal(schema.parse({ flag: true }).flag, true);
    assert.equal(schema.parse({ flag: false }).flag, false);
  });

  it("uses default when field is missing", () => {
    const schema = z.object({ flag: semanticBoolean(true) });
    assert.equal(schema.parse({}).flag, true);
  });
});

describe("semanticInteger", () => {
  it("converts numeric string to number", () => {
    const schema = z.object({ count: semanticInteger("count", { min: 0 }) });
    assert.equal(schema.parse({ count: "5" }).count, 5);
  });

  it("passes through numbers", () => {
    const schema = z.object({ count: semanticInteger("count", { min: 0 }) });
    assert.equal(schema.parse({ count: 10 }).count, 10);
  });

  it("rejects values below minimum", () => {
    const schema = z.object({ count: semanticInteger("count", { min: 1 }) });
    assert.throws(() => schema.parse({ count: 0 }));
  });

  it("rejects empty string conversion", () => {
    const schema = z.object({ count: semanticInteger("count") });
    assert.throws(() => schema.parse({ count: "" }));
  });
});

describe("executeValidatedTool", () => {
  it("returns ok result when validation passes", async () => {
    const schema = z.strictObject({ name: z.string() });
    const result = await executeValidatedTool("test", schema, { name: "hello" }, noopContext, async (input) => ({
      ok: true,
      name: "test",
      output: input.name,
    }));
    assert.equal(result.ok, true);
    assert.equal(result.output, "hello");
  });

  it("returns error when validation fails", async () => {
    const schema = z.strictObject({ name: z.string() });
    const result = await executeValidatedTool("test", schema, { name: 123 }, noopContext, async () => ({
      ok: true,
      name: "test",
      output: "never called",
    }));
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes("InputValidationError"));
  });

  it("returns error when preprocess fails", async () => {
    const schema = z.strictObject({ name: z.string() });
    const result = await executeValidatedTool(
      "test",
      schema,
      { name: "irrelevant" },
      noopContext,
      async () => ({ ok: true, name: "test", output: "never called" }),
      {
        preprocess: () => ({ ok: false, error: "Preprocess rejected input" }),
      }
    );
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes("Preprocess rejected input"));
  });

  it("passes parsed data to handler", async () => {
    const schema = z.strictObject({ value: z.number() });
    let receivedValue = 0;
    const result = await executeValidatedTool("test", schema, { value: 42 }, noopContext, async (input) => {
      receivedValue = input.value;
      return { ok: true, name: "test", output: "done" };
    });
    assert.equal(result.ok, true);
    assert.equal(receivedValue, 42);
  });

  it("handles semanticInteger preprocessing in schema", async () => {
    const schema = z.strictObject({ count: semanticInteger("count", { min: 1 }) });
    const result = await executeValidatedTool("test", schema, { count: "3" }, noopContext, async (input) => ({
      ok: true,
      name: "test",
      output: String(input.count),
    }));
    assert.equal(result.ok, true);
    assert.equal(result.output, "3");
  });

  it("propagates handler errors as uncaught throw", async () => {
    const schema = z.strictObject({});
    await assert.rejects(async () => {
      await executeValidatedTool("test", schema, {}, noopContext, async () => {
        throw new Error("Handler exploded");
      });
    }, /Handler exploded/);
  });
});
