import type { OpenAI } from "openai";
import type { PlanStep } from "./pipeline-types";
import {
  PlannerOutputSchema,
  ExecutorOutputSchema,
  type PlannerOutputInput,
  type ExecutorOutputInput,
} from "./pipeline-contracts";
import { validatePlanSemantics, validateExecutorOutputSemantics } from "./pipeline-validators";
import type { PipelineTelemetry } from "./pipeline-telemetry";

const PLANNER_SYSTEM_PROMPT = `
You are a software planning agent.
Given the user prompt, you must generate a sequence of step-by-step execution tasks to fulfill the request.
You MUST output a JSON object containing the "plan" array conforming to this structure:
{
  "plan": [
    {
      "id": "unique_step_id",
      "type": "read" | "edit" | "write" | "command",
      "instruction": "clear detailed description of what this step does",
      "filesToRead": ["relative/path/to/file"],
      "filesToWrite": ["relative/path/to/file"],
      "dependsOn": ["dependency_step_id"],
      "acceptance": ["verifiable acceptance criteria"]
    }
  ]
}

Rules:
1. "filesToWrite" must not be empty for "edit" and "write" step types.
2. "dependsOn" must only reference existing step IDs defined in the plan.
3. Steps should be small and incremental. A step should not touch more than 3 files.
4. Each step must define at least one acceptance criteria.
5. Provide precise path references relative to the project root.
`;

const EXECUTOR_SYSTEM_PROMPT = `
You are a software executor agent.
Your task is to execute the given plan step.
You MUST output a JSON object conforming to ONE of the following structures:

For "edit" action (making localized changes to existing files):
{
  "action": "edit",
  "patches": [
    {
      "targetFile": "file/path",
      "targetContent": "EXACT existing content block to replace (include proper indentation)",
      "replacementContent": "New replacement content block"
    }
  ]
}

For "write" action (creating a new file or fully overwriting one):
{
  "action": "write",
  "targetFile": "file/path",
  "content": "Full content of the file"
}

For "command" action:
{
  "action": "command",
  "command": "terminal command to run"
}

For "read" action:
{
  "action": "read"
}

Rules:
- Only edit or write files that are explicitly allowed in the step's "filesToWrite" list.
- Do NOT perform unrelated changes or refactors.
- Ensure the patches match the target file content EXACTLY.
`;

export function createPlannerAdapter(client: OpenAI, model: string, telemetry: PipelineTelemetry) {
  return async (prompt: string): Promise<PlannerOutputInput> => {
    try {
      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: PLANNER_SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      });

      const usage = response.usage;
      if (usage) {
        telemetry.recordTokens(usage.prompt_tokens, usage.completion_tokens);
      }

      const text = response.choices[0]?.message?.content || "";
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(text);
      } catch (err: unknown) {
        telemetry.recordPlannerParse(false);
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Invalid JSON output: ${msg}`);
      }

      // 1. Zod validation
      const zodParsed = PlannerOutputSchema.parse(parsedJson);
      telemetry.recordPlannerParse(true);

      // 2. Semantic validation
      const semanticErrors = validatePlanSemantics(zodParsed.plan as PlanStep[]);
      if (semanticErrors.length > 0) {
        telemetry.recordPlannerSemanticFailure();
        throw new Error(`Semantic validation failed: ${semanticErrors.map((e) => e.message).join("; ")}`);
      }

      return zodParsed;
    } catch (err: unknown) {
      const errorObj = err as { name?: string };
      if (errorObj?.name === "ZodError") {
        telemetry.recordPlannerParse(false);
      }
      throw err;
    }
  };
}

export function createExecutorAdapter(client: OpenAI, model: string, telemetry: PipelineTelemetry) {
  return async (step: PlanStep): Promise<ExecutorOutputInput> => {
    try {
      const stepSummary = `
Step ID: ${step.id}
Instruction: ${step.instruction}
Files to Read: [${step.filesToRead.join(", ")}]
Files to Write: [${step.filesToWrite.join(", ")}]
Acceptance Criteria: [${step.acceptance.join("; ")}]
`;

      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: EXECUTOR_SYSTEM_PROMPT },
          { role: "user", content: stepSummary },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      });

      const usage = response.usage;
      if (usage) {
        telemetry.recordTokens(usage.prompt_tokens, usage.completion_tokens);
      }

      const text = response.choices[0]?.message?.content || "";
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(text);
      } catch (err: unknown) {
        telemetry.recordExecutorParse(false);
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Invalid JSON output: ${msg}`);
      }

      // 1. Zod validation
      const zodParsed = ExecutorOutputSchema.parse(parsedJson);
      telemetry.recordExecutorParse(true);

      // 2. Semantic validation
      const semanticErrors = validateExecutorOutputSemantics(zodParsed, step);
      if (semanticErrors.length > 0) {
        telemetry.recordExecutorSemanticFailure();
        throw new Error(`Semantic validation failed: ${semanticErrors.map((e) => e.message).join("; ")}`);
      }

      return zodParsed;
    } catch (err: unknown) {
      const errorObj = err as { name?: string };
      if (errorObj?.name === "ZodError") {
        telemetry.recordExecutorParse(false);
      }
      throw err;
    }
  };
}
