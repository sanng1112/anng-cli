/**
 * Goal Loader
 *
 * Loads goal definitions from `.anng/goals/` directory (JSON/YAML),
 * falling back to built-in goals when no file is found.
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { readFile } from "fs/promises";
import { join, extname } from "path";
import type { GoalDef } from "./types";
import { BUILTIN_GOALS, BUILTIN_GOAL_IDS } from "./builtin-goals";

// ─────────────────────────────────────────────────────────────────────────────
// Simple YAML-like parser for .anng/goals/*.yaml files
// ─────────────────────────────────────────────────────────────────────────────

function parseYamlGoals(yaml: string): GoalDef[] {
  const goals: GoalDef[] = [];
  const lines = yaml.split("\n");
  let currentGoal: Partial<GoalDef> | null = null;
  let currentStep: Record<string, unknown> | null = null;
  let inSteps = false;
  let inParallel = false;

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line || line.startsWith("#")) continue;

    const topMatch = line.match(/^(\w+):\s*(.*)/);
    if (topMatch && !line.startsWith(" ") && !line.startsWith("-")) {
      if (topMatch[1] === "goals") continue;
      if (currentGoal && topMatch[1] === "id" && currentGoal.id && currentGoal.id !== topMatch[2]) {
        if (currentGoal.id && currentGoal.steps) {
          goals.push(currentGoal as GoalDef);
        }
        currentGoal = { id: topMatch[2] };
        inSteps = false;
        continue;
      }
      if (currentGoal) {
        const val = topMatch[2].replace(/^["']|["']$/g, "");
        if (topMatch[1] === "id") currentGoal.id = val || topMatch[2];
        else if (topMatch[1] === "name") currentGoal.name = val;
        else if (topMatch[1] === "description") currentGoal.description = val;
        else if (topMatch[1] === "version") currentGoal.version = val;
        else if (topMatch[1] === "startStepId") currentGoal.startStepId = val || topMatch[2];
        else if (topMatch[1] === "tags") currentGoal.tags = val ? val.split(",").map((t: string) => t.trim()) : [];
      }
      continue;
    }

    if (line.trim() === "steps:" && currentGoal) {
      inSteps = true;
      currentGoal.steps = [];
      continue;
    }

    if (inSteps && line.match(/^\s+- id:/)) {
      if (currentStep && currentGoal?.steps) {
        currentGoal.steps.push(currentStep as GoalDef["steps"][0]);
      }
      currentStep = { id: (line.match(/id:\s*(.*)/)?.[1] || "").replace(/["']/g, "") };
      inParallel = false;
      continue;
    }

    if (currentStep) {
      const kvMatch = line.match(/^\s+(\w+):\s*(.*)/);
      if (kvMatch) {
        const key = kvMatch[1];
        const val = kvMatch[2].replace(/^["']|["']$/g, "");
        if (key === "type") currentStep.type = val;
        else if (key === "description") currentStep.description = val;
        else if (key === "command") currentStep.command = val;
        else if (key === "prompt") currentStep.prompt = val;
        else if (key === "filePath") currentStep.filePath = val;
        else if (key === "content") currentStep.content = val;
        else if (key === "subgoalId") currentStep.subgoalId = val;
        else if (key === "conditionExpression") currentStep.conditionExpression = val;
        else if (key === "nextOnSuccess") currentStep.nextOnSuccess = val;
        else if (key === "nextOnFailure") currentStep.nextOnFailure = val;
        else if (key === "maxRetries") currentStep.maxRetries = parseInt(val, 10) || undefined;
        else if (key === "timeoutMs") currentStep.timeoutMs = parseInt(val, 10) || undefined;
        else if (key === "parallel") inParallel = true;
      }

      if (inParallel && line.match(/^\s+- id:/)) {
        if (!Array.isArray(currentStep.parallel)) (currentStep.parallel as GoalDef["steps"]) = [];
        const subStep: Record<string, unknown> = { id: (line.match(/id:\s*(.*)/)?.[1] || "").replace(/["']/g, "") };
        (currentStep.parallel as GoalDef["steps"]).push(subStep as GoalDef["steps"][0]);
      }
    }
  }

  if (currentStep && currentGoal?.steps) {
    currentGoal.steps.push(currentStep as GoalDef["steps"][0]);
  }
  if (currentGoal?.id && currentGoal?.steps) {
    goals.push(currentGoal as GoalDef);
  }

  return goals;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load a goal by name.
 *
 * Resolution order:
 * 1. `.anng/goals/<name>.json` in project root
 * 2. `.anng/goals/<name>.yaml` in project root
 * 3. Built-in goal definitions
 *
 * Returns `null` if the goal is not found.
 */
export function loadGoal(projectRoot: string, name: string): GoalDef | null {
  // 1. Try JSON file
  const jsonPath = join(projectRoot, ".anng", "goals", `${name}.json`);
  if (existsSync(jsonPath)) {
    try {
      const content = readFileSync(jsonPath, "utf-8");
      return JSON.parse(content) as GoalDef;
    } catch {
      console.error(`[goal] Failed to parse ${jsonPath}`);
      return null;
    }
  }

  // 2. Try YAML file
  const yamlPath = join(projectRoot, ".anng", "goals", `${name}.yaml`);
  if (existsSync(yamlPath)) {
    try {
      const content = readFileSync(yamlPath, "utf-8");
      const parsed = parseYamlGoals(content);
      return parsed.find((g) => g.id === name) ?? parsed[0] ?? null;
    } catch {
      console.error(`[goal] Failed to parse ${yamlPath}`);
      return null;
    }
  }

  // 3. Fall back to built-in
  return BUILTIN_GOALS[name] ?? null;
}

/**
 * Load a goal by name (async version).
 */
export async function loadGoalAsync(projectRoot: string, name: string): Promise<GoalDef | null> {
  // 1. Try JSON file
  const jsonPath = join(projectRoot, ".anng", "goals", `${name}.json`);
  try {
    const content = await readFile(jsonPath, "utf-8");
    return JSON.parse(content) as GoalDef;
  } catch {
    // fall through
  }

  // 2. Try YAML file
  const yamlPath = join(projectRoot, ".anng", "goals", `${name}.yaml`);
  try {
    const content = await readFile(yamlPath, "utf-8");
    const parsed = parseYamlGoals(content);
    return parsed.find((g) => g.id === name) ?? parsed[0] ?? null;
  } catch {
    // fall through
  }

  // 3. Fall back to built-in
  return BUILTIN_GOALS[name] ?? null;
}

/**
 * List all available goal names (built-in + custom).
 */
export function listGoals(projectRoot: string): string[] {
  const custom: string[] = [];
  const goalsDir = join(projectRoot, ".anng", "goals");
  if (existsSync(goalsDir)) {
    try {
      const entries = readdirSync(goalsDir);
      for (const entry of entries) {
        const ext = extname(entry);
        if (ext === ".json" || ext === ".yaml") {
          custom.push(entry.slice(0, -ext.length));
        }
      }
    } catch {
      // ignore
    }
  }
  return [...BUILTIN_GOAL_IDS, ...custom];
}

export { BUILTIN_GOALS, BUILTIN_GOAL_IDS };
