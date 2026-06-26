import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { PipelineOrchestrator } from "../harness/pipeline-orchestrator";

const config = {
  plannerModel: "stub-planner",
  executorModel: "stub-executor",
  fixerModel: "stub-fixer",
  maxRepairAttempts: 2,
};

describe("Pipeline E2E Dry Run with Deterministic Stubs", () => {
  it("should successfully execute a multi-step plan E2E on a toy repo", async () => {
    // 1. Create a toy directory
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "toy-repo-"));
    const mathFile = path.join(tempDir, "math.ts");
    const testFile = path.join(tempDir, "test.ts");

    fs.writeFileSync(
      mathFile,
      `export function add(a: number, b: number): number {
  return a + b;
}`,
      "utf8"
    );

    // 2. Initialize orchestrator
    const orchestrator = new PipelineOrchestrator("Add subtract function and write test file", config);

    // 3. Define stubs
    const stubs = {
      plannerStub: async () => {
        return {
          plan: [
            {
              id: "step1",
              type: "read",
              instruction: "Read math.ts to understand add function",
              filesToRead: [mathFile],
              filesToWrite: [],
              dependsOn: [],
              acceptance: ["file exists"],
            },
            {
              id: "step2",
              type: "edit",
              instruction: "Add subtract function to math.ts",
              filesToRead: [mathFile],
              filesToWrite: [mathFile],
              dependsOn: ["step1"],
              acceptance: ["subtract function is exported"],
            },
            {
              id: "step3",
              type: "write",
              instruction: "Write test file and verify correctness",
              filesToRead: [mathFile],
              filesToWrite: [testFile],
              dependsOn: ["step2"],
              acceptance: ["test file exists and executes cleanly"],
              verifyScope: "final" as const,
            },
          ],
        };
      },
      executorStub: async (step: any) => {
        if (step.id === "step1") {
          return { action: "read" };
        }
        if (step.id === "step2") {
          return {
            action: "edit",
            patches: [
              {
                targetFile: mathFile,
                targetContent: `export function add(a: number, b: number): number {
  return a + b;
}`,
                replacementContent: `export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a - b;
}`,
              },
            ],
          };
        }
        if (step.id === "step3") {
          return {
            action: "write",
            targetFile: testFile,
            content: `import { add, subtract } from "./math";
if (add(1, 2) !== 3) throw new Error("add failed");
if (subtract(5, 3) !== 2) throw new Error("subtract failed");
`,
          };
        }
        throw new Error(`Unexpected step in executor: ${step.id}`);
      },
      verifyStub: async (level: string, context: any) => {
        if (level === "step") {
          const step = context.step;
          if (step.id === "step1") {
            return { success: fs.existsSync(mathFile) };
          }
          if (step.id === "step2") {
            const content = fs.readFileSync(mathFile, "utf8");
            return { success: content.includes("subtract") };
          }
          if (step.id === "step3") {
            return { success: true };
          }
        }
        if (level === "milestone") {
          return { success: true };
        }
        if (level === "final") {
          return { success: fs.existsSync(testFile) };
        }
        return { success: false, errorSummary: "Unknown verify level" };
      },
      fixerStub: async () => {
        // No fixer actions needed for a clean run
      },
    };

    // 4. Run E2E
    const finalState = await orchestrator.executeE2E(stubs);

    // 5. Assertions
    if (finalState !== "done") {
      console.log("Pipeline E2E failures:", JSON.stringify(orchestrator.getRunState().failures, null, 2));
    }
    expect(finalState).toBe("done");
    expect(fs.existsSync(testFile)).toBe(true);
    const mathContent = fs.readFileSync(mathFile, "utf8");
    expect(mathContent).toContain("export function subtract");

    // Cleanup
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("should trigger repair loop and succeed when a step initially fails but fixer repairs it", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "toy-repo-failed-"));
    const targetFile = path.join(tempDir, "file.txt");

    fs.writeFileSync(targetFile, "initial content", "utf8");

    const orchestrator = new PipelineOrchestrator("Update file.txt", config);

    let step2FailureSimulated = false;
    let step2ExecutedTimes = 0;

    const stubs = {
      plannerStub: async () => {
        return {
          plan: [
            {
              id: "step1",
              type: "write",
              instruction: "Write something",
              filesToRead: [],
              filesToWrite: [targetFile],
              dependsOn: [],
              acceptance: ["content is updated"],
            },
          ],
        };
      },
      executorStub: async () => {
        step2ExecutedTimes++;
        if (!step2FailureSimulated) {
          // Propose a faulty write (denied write path outside step's scope to cause failure)
          throw new Error("Simulated compilation error during execution");
        }
        return {
          action: "write",
          targetFile,
          content: "repaired content",
        };
      },
      verifyStub: async () => {
        return { success: true };
      },
      fixerStub: async () => {
        // Fixer corrects the state
        step2FailureSimulated = true;
      },
    };

    const finalState = await orchestrator.executeE2E(stubs);

    expect(finalState).toBe("done");
    expect(step2ExecutedTimes).toBe(2); // First failed, then fixer ran, second execution succeeded
    expect(fs.readFileSync(targetFile, "utf8")).toBe("repaired content");

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("should fail the pipeline if a step fails repeatedly and exceeds repair attempts", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "toy-repo-max-retry-"));
    const targetFile = path.join(tempDir, "file.txt");
    fs.writeFileSync(targetFile, "initial", "utf8");

    const orchestrator = new PipelineOrchestrator("Failing pipeline", config);

    const stubs = {
      plannerStub: async () => {
        return {
          plan: [
            {
              id: "step1",
              type: "write",
              instruction: "Failing step",
              filesToRead: [],
              filesToWrite: [targetFile],
              dependsOn: [],
              acceptance: ["does not matter"],
            },
          ],
        };
      },
      executorStub: async () => {
        throw new Error("Persistent executor failure");
      },
      verifyStub: async () => {
        return { success: true };
      },
      fixerStub: async () => {
        // Fixer runs but does not fix the persistent error
      },
    };

    await expect(orchestrator.executeE2E(stubs)).resolves.toBe("failed");
    expect(orchestrator.getRunState().failures.length).toBe(2); // maxRepairAttempts is 2

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
