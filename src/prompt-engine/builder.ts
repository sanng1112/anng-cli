/**
 * Prompt Builder
 *
 * Assembles the final system prompt by:
 * 1. Selecting the base template based on mode (act → DEFAULT, yolo → YOLO)
 * 2. Replacing {{PLACEHOLDER}} markers with actual values
 * 3. Merging rules (mode-specific instructions + user rules + ANNG.md)
 * 4. Appending workspace metadata as a structured JSON block
 *
 * Inspired by Cline's buildClineSystemPrompt() + resolveSystemPrompt().
 */

import type { AgentMode } from "../harness/types";
import { DEFAULT_SYSTEM_PROMPT, YOLO_SYSTEM_PROMPT, PLAN_MODE_INSTRUCTIONS } from "./templates";
import { buildWorkspaceMetadata } from "./metadata";
import { getGoalSnapshot } from "../common/goal-store";
import { buildRuleBundle } from "../core/rules/discovery";
// Imported for future rules context refactoring seam
import { buildRuleBundle as buildRuleBundleV2 } from "../core/engine/rules-context";

// =============================================================================
// Types
// =============================================================================

export interface BuildPromptOptions {
  mode: AgentMode;
  cwd: string;
  /** Override the entire system prompt (--system flag) */
  overridePrompt?: string;
  /** Extra rules to inject (from ANNG.md, AGENTS.md, etc.) */
  extraRules?: string;
  /** Explicit system prompt from HarnessConfig */
  explicitSystemPrompt?: string;
}

export interface BuildPromptResult {
  systemPrompt: string;
  metadata: ReturnType<typeof buildWorkspaceMetadata>;
}

// =============================================================================
// Builder
// =============================================================================

export function buildSystemPrompt(options: BuildPromptOptions): BuildPromptResult {
  const metadata = buildWorkspaceMetadata(options.cwd);
  // Metadata is NOT embedded in the base prompt to preserve prefix caching —
  // the session appends it as a separate system message layer.
  const formattedMetadata = "";

  // 1. Handle explicit override
  const explicit = options.explicitSystemPrompt || options.overridePrompt;
  if (explicit?.trim()) {
    const trimmed = explicit.trim();
    let prompt = trimmed.includes("{{CLINE_METADATA}}")
      ? replacePlaceholders(trimmed, {
          PLATFORM: metadata.platform,
          CURRENT_DATE: metadata.date,
          CWD: metadata.cwd,
          CLINE_METADATA: formattedMetadata,
          CLINE_RULES: resolveRules(options),
        })
      : trimmed;
    try {
      const goalSnapshot = getGoalSnapshot(options.cwd);
      if (goalSnapshot.activeGoal) {
        prompt = `# ACTIVE PROJECT GOAL\n\nYou are currently working towards this project-wide goal:\n${goalSnapshot.activeGoal.text}\n\n${prompt}`;
      }
    } catch {
      // ignore
    }
    return { systemPrompt: prompt, metadata };
  }

  // 2. Select base template
  const template = options.mode === "yolo" ? YOLO_SYSTEM_PROMPT : DEFAULT_SYSTEM_PROMPT;

  // 3. Replace placeholders (metadata is empty string for prefix caching)
  const systemPrompt = replacePlaceholders(template, {
    PLATFORM: metadata.platform,
    CURRENT_DATE: metadata.date,
    CWD: metadata.cwd,
    CLINE_METADATA: formattedMetadata,
    CLINE_RULES: resolveRules(options),
  });

  let finalPrompt = systemPrompt;
  try {
    const goalSnapshot = getGoalSnapshot(options.cwd);
    if (goalSnapshot.activeGoal) {
      finalPrompt = `# ACTIVE PROJECT GOAL\n\nYou are currently working towards this project-wide goal:\n${goalSnapshot.activeGoal.text}\n\n${finalPrompt}`;
    }
  } catch {
    // ignore
  }

  return { systemPrompt: finalPrompt, metadata };
}

// =============================================================================
// Rules resolution
// =============================================================================

function resolveRules(options: BuildPromptOptions): string {
  const parts: string[] = [];

  // Plan mode instructions (as rules, not base prompt)
  if (options.mode === "plan") {
    parts.push(PLAN_MODE_INSTRUCTIONS);
  }

  // ANNG.md / AGENTS.md rules
  const fileRules = loadFileRules(options.cwd);
  if (fileRules) parts.push(fileRules);

  // Extra rules from caller
  if (options.extraRules) parts.push(options.extraRules);

  if (parts.length === 0) return "";

  return `# Rules\n\n${parts.join("\n\n")}`;
}

function loadFileRules(projectRoot: string): string | undefined {
  try {
    const bundle = buildRuleBundle({ cwd: projectRoot });
    return bundle.content.trim() || undefined;
  } catch {
    return undefined;
  }
}

// =============================================================================
// Placeholder replacement
// =============================================================================

function replacePlaceholders(template: string, values: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value || "");
  }
  return result;
}
