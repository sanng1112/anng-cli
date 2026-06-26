import { describe, it, expect } from "vitest";
import { validatePlanSemantics, validateExecutorOutputSemantics } from "../harness/pipeline-validators";
import { PipelineTelemetry } from "../harness/pipeline-telemetry";
import { createPlannerAdapter, createExecutorAdapter } from "../harness/pipeline-adapters";
import { createPlanStep } from "../harness/pipeline-factories";

describe("Pipeline Validators — Semantic Checks", () => {
  it("should fail validation if filesToWrite is empty for edit or write steps", () => {
    const s1 = createPlanStep("s1", "edit", "Update math functions", [], [], ["checked"]);
    const errors = validatePlanSemantics([s1]);
    expect(errors.some((e) => e.field === "filesToWrite")).toBe(true);
  });

  it("should pass validation if filesToWrite is populated for edit or write steps", () => {
    const s1 = createPlanStep("s1", "edit", "Update math functions", [], ["math.ts"], ["checked"]);
    const errors = validatePlanSemantics([s1]);
    expect(errors.length).toBe(0);
  });

  it("should fail validation if dependsOn references a non-existent step", () => {
    const s1 = createPlanStep("s1", "read", "Read math.ts", [], [], ["checked"], ["non-existent"]);
    const errors = validatePlanSemantics([s1]);
    expect(errors.some((e) => e.field === "dependsOn")).toBe(true);
  });

  it("should detect circular dependencies", () => {
    const s1 = createPlanStep("s1", "read", "Read math.ts", [], [], ["checked"], ["s2"]);
    const s2 = createPlanStep("s2", "read", "Read test.ts", [], [], ["checked"], ["s1"]);
    const errors = validatePlanSemantics([s1, s2]);
    expect(errors.some((e) => e.message.includes("Circular dependency"))).toBe(true);
  });

  it("should fail validation if step modifies more than 3 files (granularity limit)", () => {
    const s1 = createPlanStep(
      "s1",
      "edit",
      "Update configurations",
      [],
      ["f1.ts", "f2.ts", "f3.ts", "f4.ts"],
      ["checked"]
    );
    const errors = validatePlanSemantics([s1]);
    expect(errors.some((e) => e.message.includes("modifies too many files"))).toBe(true);
  });

  it("should fail validation if step instruction is too short or too long", () => {
    const shortStep = createPlanStep("s1", "read", "Do", [], [], ["checked"]);
    let errors = validatePlanSemantics([shortStep]);
    expect(errors.some((e) => e.message.includes("Instruction is too short"))).toBe(true);

    const longStep = createPlanStep(
      "s2",
      "read",
      "This is an extremely long instruction that tries to explain everything in a single sentence but goes on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on",
      [],
      [],
      ["checked"]
    );
    errors = validatePlanSemantics([longStep]);
    expect(errors.some((e) => e.message.includes("Instruction is too long"))).toBe(true);
  });

  it("should validate executor outputs against step boundaries", () => {
    const step = createPlanStep("s1", "edit", "Update math.ts", [], ["math.ts"], ["checked"]);

    // Valid output
    const validAction = {
      action: "edit",
      patches: [{ targetFile: "math.ts", targetContent: "add", replacementContent: "sum" }],
    };
    let errors = validateExecutorOutputSemantics(validAction, step);
    expect(errors.length).toBe(0);

    // Boundary violation
    const invalidAction = {
      action: "edit",
      patches: [{ targetFile: "secret.ts", targetContent: "leak", replacementContent: "clean" }],
    };
    errors = validateExecutorOutputSemantics(invalidAction, step);
    expect(errors.some((e) => e.message.includes("Boundary violation"))).toBe(true);
  });
});

describe("Pipeline LLM Adapters — Mocks & Telemetry", () => {
  it("should track tokens and succeed when planner returns valid schema", async () => {
    const telemetry = new PipelineTelemetry();

    const mockClient = {
      chat: {
        completions: {
          create: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    plan: [
                      {
                        id: "step1",
                        type: "read",
                        instruction: "Read source code file",
                        filesToRead: ["src/index.ts"],
                        filesToWrite: [],
                        dependsOn: [],
                        acceptance: ["file read successfully"],
                      },
                    ],
                  }),
                },
              },
            ],
            usage: {
              prompt_tokens: 150,
              completion_tokens: 50,
            },
          }),
        },
      },
    } as any;

    const planner = createPlannerAdapter(mockClient, "gpt-mock", telemetry);
    const plan = await planner("Write index.ts test");

    expect(plan.plan[0].id).toBe("step1");

    const report = telemetry.getReport();
    expect(report.plannerParseSuccesses).toBe(1);
    expect(report.tokensUsed.promptTokens).toBe(150);
    expect(report.tokensUsed.completionTokens).toBe(50);
  });

  it("should record parse failure when planner output is invalid JSON", async () => {
    const telemetry = new PipelineTelemetry();

    const mockClient = {
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { content: "not a json string" } }],
            usage: { prompt_tokens: 10, completion_tokens: 2 },
          }),
        },
      },
    } as any;

    const planner = createPlannerAdapter(mockClient, "gpt-mock", telemetry);
    await expect(planner("test")).rejects.toThrow("Invalid JSON output");

    const report = telemetry.getReport();
    expect(report.plannerParseFailures).toBe(1);
  });

  it("should record semantic failure when planner plan has circular dependency", async () => {
    const telemetry = new PipelineTelemetry();

    const mockClient = {
      chat: {
        completions: {
          create: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    plan: [
                      {
                        id: "s1",
                        type: "read",
                        instruction: "Read code base first step",
                        filesToRead: [],
                        filesToWrite: [],
                        dependsOn: ["s2"],
                        acceptance: ["ok"],
                      },
                      {
                        id: "s2",
                        type: "read",
                        instruction: "Read code base second step",
                        filesToRead: [],
                        filesToWrite: [],
                        dependsOn: ["s1"],
                        acceptance: ["ok"],
                      },
                    ],
                  }),
                },
              },
            ],
          }),
        },
      },
    } as any;

    const planner = createPlannerAdapter(mockClient, "gpt-mock", telemetry);
    await expect(planner("test")).rejects.toThrow("Circular dependency detected");

    const report = telemetry.getReport();
    expect(report.plannerSemanticFailures).toBe(1);
  });
});
