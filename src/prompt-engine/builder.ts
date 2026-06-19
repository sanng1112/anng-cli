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

import * as fs from "fs";
import * as path from "path";
import type { AgentMode } from "../harness/types";
import { DEFAULT_SYSTEM_PROMPT, YOLO_SYSTEM_PROMPT, PLAN_MODE_INSTRUCTIONS } from "./templates";
import { buildWorkspaceMetadata } from "./metadata";

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
    const prompt = trimmed.includes("{{CLINE_METADATA}}")
      ? replacePlaceholders(trimmed, {
          PLATFORM: metadata.platform,
          CURRENT_DATE: metadata.date,
          CWD: metadata.cwd,
          CLINE_METADATA: formattedMetadata,
          CLINE_RULES: resolveRules(options),
        })
      : trimmed;
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

  return { systemPrompt, metadata };
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
  const candidates = [
    path.join(projectRoot, "ANNG.md"),
    // Note: AGENTS.md is handled separately by SessionManager.loadAgentInstructions()
    path.join(projectRoot, ".anng", "rules"),
    path.join(projectRoot, ".agents", "rules"),
  ];

  const blocks: string[] = [];
  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) {
        if (fs.statSync(filePath).isDirectory()) {
          // Directory: read all .md files
          const entries = fs.readdirSync(filePath);
          for (const entry of entries.sort()) {
            if (entry.endsWith(".md")) {
              const content = fs.readFileSync(path.join(filePath, entry), "utf8");
              if (content.trim()) {
                blocks.push(`## ${entry.replace(/\.md$/, "")}\n${content.trim()}`);
              }
            }
          }
        } else {
          const content = fs.readFileSync(filePath, "utf8");
          if (content.trim()) {
            blocks.push(content.trim());
          }
        }
      }
    } catch {
      // Silently skip unreadable files
    }
  }

  return blocks.length > 0 ? blocks.join("\n\n") : undefined;
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
