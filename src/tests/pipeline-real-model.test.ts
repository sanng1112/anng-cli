import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { OpenAI } from "openai";
import { resolveCurrentSettings } from "../settings";
import { PipelineOrchestrator } from "../harness/pipeline-orchestrator";
import { PipelineTelemetry } from "../harness/pipeline-telemetry";
import { createPlannerAdapter, createExecutorAdapter } from "../harness/pipeline-adapters";

describe("Real-Model Narrow Integration Test", () => {
  it("should run E2E using real Gemini models on a toy repository", async () => {
    // 1. Resolve configuration and API keys
    const settings = resolveCurrentSettings(process.cwd());
    const apiKey = settings.geminiApiKey || settings.apiKey;

    if (!apiKey) {
      console.log("⚠️ Skipping Real-Model integration test: No Gemini API Key found in settings.");
      return;
    }

    console.log("Starting E2E narrow integration with real model...");

    // 2. Initialize real OpenAI client pointing to Gemini
    const singleApiKey = apiKey.split(",")[0].trim();
    const client = new OpenAI({
      apiKey: singleApiKey,
      baseURL: settings.geminiBaseURL || "https://generativelanguage.googleapis.com/v1beta/openai/",
    });

    const plannerModel = "gemini-3.5-flash";
    const executorModel = "gemini-3.5-flash"; // Use fast flash model for executor

    // 3. Create temp directory
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "real-toy-repo-"));
    const mathFile = path.join(tempDir, "math.ts");

    // Initialize telemetry
    const telemetry = new PipelineTelemetry();

    // Create adapters using real models
    const plannerAdapter = createPlannerAdapter(client, plannerModel, telemetry);
    const executorAdapter = createExecutorAdapter(client, executorModel, telemetry);

    // 4. Define verify policies
    const verifyStub = async (level: string, context: any) => {
      if (level === "step") {
        const step = context.step;
        // Verify file was written
        if (step.type === "write" || step.type === "edit") {
          for (const file of step.filesToWrite) {
            if (!fs.existsSync(file)) {
              return { success: false, errorSummary: `Required file ${file} does not exist.` };
            }
          }
        }
        return { success: true };
      }
      if (level === "milestone") {
        return { success: true };
      }
      if (level === "final") {
        if (!fs.existsSync(mathFile)) {
          return { success: false, errorSummary: "math.ts was not created." };
        }
        const content = fs.readFileSync(mathFile, "utf8");
        const hasSquare = content.includes("function square") || content.includes("const square");
        if (!hasSquare) {
          return { success: false, errorSummary: "math.ts does not export square function." };
        }
        return { success: true };
      }
      return { success: false, errorSummary: "Unknown verify level" };
    };

    // Stubs for fixer since it's stubbed in this milestone
    const fixerStub = async () => {
      return { success: true };
    };

    // Prompt instructions relative to the temp folder
    const prompt = `Write a TypeScript function that computes the square of a number. Write it to the file ${mathFile}. The function must be named 'square' and take a parameter 'x' of type 'number' returning 'number'.`;

    // 5. Initialize orchestrator
    const orchestrator = new PipelineOrchestrator(prompt, {
      plannerModel,
      executorModel,
      fixerModel: "stub",
      maxRepairAttempts: 2,
    });

    // 6. Run E2E
    try {
      const finalState = await orchestrator.executeE2E({
        plannerStub: plannerAdapter,
        executorStub: executorAdapter,
        verifyStub,
        fixerStub,
      });

      console.log(telemetry.printSummary());

      // 7. Assertions
      expect(finalState).toBe("done");
      expect(fs.existsSync(mathFile)).toBe(true);
      const mathContent = fs.readFileSync(mathFile, "utf8");
      expect(mathContent).toContain("square");

      const report = telemetry.getReport();
      expect(report.totalRequests).toBeGreaterThanOrEqual(2); // At least planner + executor
      expect(report.plannerParseSuccesses).toBe(1);
      expect(report.executorParseSuccesses).toBe(1);
    } catch (error) {
      console.error("Real model E2E run failed:", error);
      throw error;
    } finally {
      // Cleanup
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }, 60000);
});
