/**
 * Harness Output Abstraction
 *
 * Provides a unified output layer for the CLI harness that supports
 * both human-readable "text" and machine-parseable "json" output modes.
 *
 * In JSON mode every significant lifecycle event is emitted as a single
 * JSON line on stdout, making it easy to consume in CI/CD pipelines.
 *
 * Inspired by Cline's utils/output.ts
 */

import type { JsonEvent, JsonEventType, OutputMode } from "./types";

// =============================================================================
// ANSI color constants (no dependency)
// =============================================================================

export const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
} as const;

// =============================================================================
// Output mode singleton
// =============================================================================

let _outputMode: OutputMode = "text";

export function setOutputMode(mode: OutputMode): void {
  _outputMode = mode;
}

export function getOutputMode(): OutputMode {
  return _outputMode;
}

// =============================================================================
// Helpers
// =============================================================================

function nowIso(): string {
  return new Date().toISOString();
}

function isBrokenPipeError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string" &&
    (error as { code: string }).code === "EPIPE"
  );
}

// =============================================================================
// JSON emitter
// =============================================================================

export function emitJson(type: JsonEventType, extra: Record<string, unknown> = {}): void {
  const event: JsonEvent = { ts: nowIso(), type, ...extra };
  const line = JSON.stringify(event, jsonReplacer) + "\n";
  try {
    process.stdout.write(line);
  } catch (error) {
    if (!isBrokenPipeError(error)) throw error;
  }
}

function jsonReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (typeof value === "bigint") return value.toString();
  return value;
}

// =============================================================================
// Text output
// =============================================================================

export function write(text: string): void {
  try {
    process.stdout.write(text);
  } catch (error) {
    if (!isBrokenPipeError(error)) throw error;
  }
}

export function writeln(text = ""): void {
  if (_outputMode === "json") return; // text suppressed in JSON mode
  write(text + "\n");
}

export function writeErr(text: string): void {
  if (_outputMode === "json") {
    emitJson("error", { message: text });
    return;
  }
  try {
    process.stderr.write(`${c.red}error:${c.reset} ${text}\n`);
  } catch (error) {
    if (!isBrokenPipeError(error)) throw error;
  }
}

export function writeDiagnostic(text: string): void {
  try {
    process.stderr.write(text + "\n");
  } catch (error) {
    if (!isBrokenPipeError(error)) throw error;
  }
}

// =============================================================================
// Formatting helpers
// =============================================================================

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function formatUsd(value: number, fixed = 6): string {
  if (!Number.isFinite(value) || value <= 0) return "$0.00";
  return `$${value.toFixed(fixed)}`;
}

export function formatTokens(usage: {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  totalCost?: number;
}): string {
  const parts: string[] = [`${usage.inputTokens} in`, `${usage.outputTokens} out`];
  if (usage.cacheReadTokens) parts.push(`${usage.cacheReadTokens} cache read`);
  if (usage.cacheWriteTokens) parts.push(`${usage.cacheWriteTokens} cache write`);
  return parts.join(", ");
}
