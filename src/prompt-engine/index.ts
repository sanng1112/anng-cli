/**
 * Prompt Module
 *
 * Central module for all prompt assembly in ANNG CLI.
 *
 * Exports:
 * - `buildSystemPrompt()` — The new structured builder (template + rules + metadata)
 * - `buildWorkspaceMetadata()` / `formatMetadataBlock()` — Workspace info
 * - `DEFAULT_SYSTEM_PROMPT`, `YOLO_SYSTEM_PROMPT`, `PLAN_MODE_INSTRUCTIONS` — Templates
 *
 * Legacy functions (`getSystemPrompt`, `getRuntimeContext`, etc.) remain
 * exported from the original `src/prompt.ts` for backward compatibility.
 *
 * Inspired by Cline's prompt layering architecture.
 */

// =============================================================================
// New structured API (preferred)
// =============================================================================

export { buildSystemPrompt } from "./builder";
export type { BuildPromptOptions, BuildPromptResult } from "./builder";

export { buildWorkspaceMetadata, formatMetadataBlock } from "./metadata";
export type { WorkspaceMetadata, MetadataOptions } from "./metadata";

export { DEFAULT_SYSTEM_PROMPT, YOLO_SYSTEM_PROMPT, PLAN_MODE_INSTRUCTIONS } from "./templates";
