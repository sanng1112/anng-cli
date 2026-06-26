import { describe, it, expect } from "vitest";
import { normalizeErrorMessage, buildErrorSignature } from "../harness/pipeline-error-utils";
import { buildExecutorPrompt } from "../harness/pipeline-context-builder";
import { createPlanStep, createFailurePacket } from "../harness/pipeline-factories";

describe("pipeline-error-utils", () => {
  it("should strip timestamps from error messages", () => {
    const msg = "2026-06-26T20:28:59Z ERROR: null pointer";
    expect(normalizeErrorMessage(msg)).toBe("ERROR: null pointer");
  });

  it("should strip line:column references", () => {
    const msg = "TypeError: src/main.ts:12:34 undefined";
    expect(normalizeErrorMessage(msg)).not.toMatch(/:\d+:\d+/);
  });

  it("should strip 'at line N' references", () => {
    const msg = "Crash at line 42, col 5";
    expect(normalizeErrorMessage(msg)).not.toMatch(/at line \d+/i);
  });

  it("should produce the same signature for same semantic errors with different timestamps", () => {
    const err1 = "2026-06-26T20:00:00Z ERROR: Division by zero";
    const err2 = "2026-06-27T08:30:00Z ERROR: Division by zero";
    expect(buildErrorSignature(err1)).toBe(buildErrorSignature(err2));
  });

  it("should produce different signatures for different errors", () => {
    const err1 = "ERROR: Division by zero";
    const err2 = "ERROR: Null pointer exception";
    expect(buildErrorSignature(err1)).not.toBe(buildErrorSignature(err2));
  });
});

describe("pipeline-context-builder", () => {
  it("should include step id and goal in executor prompt", () => {
    const step = createPlanStep(
      "s1",
      "edit",
      "Add formatDate helper",
      ["src/utils.ts"],
      ["src/utils.ts"],
      ["formatDate is exported"]
    );
    const prompt = buildExecutorPrompt(step);
    expect(prompt).toContain("EXECUTOR STEP: s1");
    expect(prompt).toContain("Add formatDate helper");
  });

  it("should include file boundaries in the prompt", () => {
    const step = createPlanStep("s1", "edit", "fix", ["src/a.ts"], ["src/b.ts"], ["compiles"]);
    const prompt = buildExecutorPrompt(step);
    expect(prompt).toContain("src/a.ts");
    expect(prompt).toContain("src/b.ts");
  });

  it("should always include FORBIDDEN BEHAVIOR section", () => {
    const step = createPlanStep("s1", "write", "create file", [], ["src/new.ts"], ["exists"]);
    const prompt = buildExecutorPrompt(step);
    expect(prompt).toContain("FORBIDDEN BEHAVIOR");
    expect(prompt).toContain("Do NOT modify files outside");
  });

  it("should include acceptance criteria", () => {
    const step = createPlanStep("s1", "edit", "do", [], [], ["unit tests pass", "no lint errors"]);
    const prompt = buildExecutorPrompt(step);
    expect(prompt).toContain("unit tests pass");
    expect(prompt).toContain("no lint errors");
  });

  it("should append failure packet when provided", () => {
    const step = createPlanStep("s1", "edit", "fix error", ["src/main.ts"], ["src/main.ts"], ["compiles"]);
    const packet = createFailurePacket("s1", ["src/main.ts"], "TS2304: Cannot find name", {
      stderrExcerpt: "error TS2304",
    });
    const prompt = buildExecutorPrompt(step, packet);
    expect(prompt).toContain("PREVIOUS FAILURE CONTEXT");
    expect(prompt).toContain("TS2304");
  });
});
