import { describe, it, expect } from "vitest";
import { PipelineOrchestrator } from "../harness/pipeline-orchestrator";

const config = {
  plannerModel: "gemini-3.5-flash",
  executorModel: "gemini-3.1-flash-lite",
  fixerModel: "gemini-3.5-flash",
  maxRepairAttempts: 2,
};

describe("PipelineOrchestrator — State Machine", () => {
  it("should initialize in planning state", () => {
    const o = new PipelineOrchestrator("Test prompt", config);
    expect(o.getState()).toBe("planning");
    expect(o.getRunState().state).toBe("planning");
  });

  it("should allow valid transition: planning -> executing", () => {
    const o = new PipelineOrchestrator("Test", config);
    o.transitionTo("executing");
    expect(o.getState()).toBe("executing");
  });

  it("should keep runState.state in sync after transition", () => {
    const o = new PipelineOrchestrator("Test", config);
    o.transitionTo("executing");
    o.transitionTo("verifying_step");
    expect(o.getRunState().state).toBe("verifying_step");
  });

  it("should reject invalid transition: planning -> verifying_final", () => {
    const o = new PipelineOrchestrator("Test", config);
    expect(() => o.transitionTo("verifying_final")).toThrow("Invalid state transition");
  });

  it("should reject invalid transition: done -> executing", () => {
    const o = new PipelineOrchestrator("Test", config);
    o.transitionTo("executing");
    o.transitionTo("verifying_step");
    o.transitionTo("verifying_final");
    o.transitionTo("done");
    expect(() => o.transitionTo("executing")).toThrow("Invalid state transition");
  });
});

describe("PipelineOrchestrator — Failure Tracking & Anti-Loop", () => {
  it("should record failure with incremented attempt count", () => {
    const o = new PipelineOrchestrator("Test", config);
    const f1 = o.recordFailure("s1", "compile error");
    expect(f1.attempt).toBe(1);
    const f2 = o.recordFailure("s1", "compile error again");
    expect(f2.attempt).toBe(2);
  });

  it("should allow retry when under maxRepairAttempts", () => {
    const o = new PipelineOrchestrator("Test", config);
    expect(o.canRetry("s1")).toBe(true);
    o.recordFailure("s1", "error 1");
    expect(o.canRetry("s1")).toBe(true); // 1 failure, max is 2
  });

  it("should deny retry when maxRepairAttempts reached", () => {
    const o = new PipelineOrchestrator("Test", config);
    o.recordFailure("s1", "error 1");
    o.recordFailure("s1", "error 2");
    expect(o.canRetry("s1")).toBe(false); // 2 failures, max is 2
  });

  it("should detect repeated failure by semantic signature", () => {
    const o = new PipelineOrchestrator("Test", config);
    o.recordFailure("s1", "2026-06-01T10:00:00Z ERROR: null pointer");
    // Same error, different timestamp -> same signature
    expect(o.hasRepeatedFailure("s1", "2026-06-02T20:00:00Z ERROR: null pointer")).toBe(true);
  });

  it("should not flag repeated failure for different errors", () => {
    const o = new PipelineOrchestrator("Test", config);
    o.recordFailure("s1", "ERROR: null pointer");
    expect(o.hasRepeatedFailure("s1", "ERROR: index out of bounds")).toBe(false);
  });

  it("should trigger shouldAbortRepair when max attempts reached", () => {
    const o = new PipelineOrchestrator("Test", config);
    o.recordFailure("s1", "error 1");
    o.recordFailure("s1", "error 2");
    expect(o.shouldAbortRepair("s1", "error 3")).toBe(true);
  });

  it("should trigger shouldAbortRepair on same semantic error", () => {
    const o = new PipelineOrchestrator("Test", config);
    o.recordFailure("s1", "ERROR: Division by zero");
    // Only 1 attempt used but repeated same error → abort
    expect(o.shouldAbortRepair("s1", "ERROR: Division by zero")).toBe(true);
  });
});
