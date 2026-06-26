import { z } from "zod";

/**
 * Zod Schema for validation of a single step in the planner's plan.
 */
export const PlanStepSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["read", "edit", "write", "command"]),
  instruction: z.string().min(1),
  filesToRead: z.array(z.string()),
  filesToWrite: z.array(z.string()),
  dependsOn: z.array(z.string()),
  acceptance: z.array(z.string()).min(1),
  verifyScope: z.enum(["step", "milestone", "final"]).optional().default("step"),
});

/**
 * Zod Schema for validation of the complete planner's output plan.
 */
export const PlannerOutputSchema = z.object({
  plan: z.array(PlanStepSchema).min(1),
});

/**
 * Zod Schema for a single patch operation to be applied by the patch handler.
 */
export const SimplePatchSchema = z.object({
  targetFile: z.string().min(1),
  targetContent: z.string(),
  replacementContent: z.string(),
});

/**
 * Zod Schema for structured Executor outputs, avoiding raw/unstructured text responses.
 */
export const ExecutorOutputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("edit"),
    patches: z.array(SimplePatchSchema).min(1),
  }),
  z.object({
    action: z.literal("write"),
    targetFile: z.string().min(1),
    content: z.string(),
  }),
  z.object({
    action: z.literal("command"),
    command: z.string().min(1),
  }),
  z.object({
    action: z.literal("read"),
  }),
]);

export type PlanStepInput = z.infer<typeof PlanStepSchema>;
export type PlannerOutputInput = z.infer<typeof PlannerOutputSchema>;
export type SimplePatchInput = z.infer<typeof SimplePatchSchema>;
export type ExecutorOutputInput = z.infer<typeof ExecutorOutputSchema>;
