import { describe, it, expect } from "vitest";
import { createInitialPipelineRun, createPlanStep, createFailurePacket } from "../harness/pipeline-factories";

describe("Pipeline Types & Factories", () => {
  it("should create initial pipeline run correctly", () => {
    const run = createInitialPipelineRun("Refactor authentication");
    expect(run.userPrompt).toBe("Refactor authentication");
    expect(run.state).toBe("planning");
    expect(run.failures).toEqual([]);
    expect(run.modifiedFiles).toEqual([]);
    expect(run.plan).toEqual([]);
    expect(run.attemptCount).toBe(0);
  });

  it("should create plan step correctly with defaults", () => {
    const step = createPlanStep(
      "s1",
      "edit",
      "Fix key rotator format",
      ["src/common/key-rotator.ts"],
      ["src/common/key-rotator.ts"],
      ["Rotator tests compile successfully"]
    );
    expect(step.id).toBe("s1");
    expect(step.type).toBe("edit");
    expect(step.status).toBe("pending");
    expect(step.dependsOn).toEqual([]);
    expect(step.filesToWrite).toContain("src/common/key-rotator.ts");
  });

  it("should create plan step with dependencies", () => {
    const step = createPlanStep("s2", "write", "Create index", [], ["src/index.ts"], ["compiles"], ["s1"]);
    expect(step.dependsOn).toContain("s1");
  });

  it("should create failure packet with defaults", () => {
    const packet = createFailurePacket("s1", ["src/main.ts"], "Compilation error");
    expect(packet.failedStepId).toBe("s1");
    expect(packet.suspectedScope).toContain("src/main.ts");
    expect(packet.originalAcceptance).toEqual([]);
  });

  it("should create failure packet with override scope", () => {
    const packet = createFailurePacket("s1", ["src/main.ts"], "TS error", {
      suspectedScope: ["src/utils.ts"],
      stderrExcerpt: "error TS2304",
    });
    expect(packet.suspectedScope).toContain("src/utils.ts");
    expect(packet.stderrExcerpt).toBe("error TS2304");
  });
});
