/**
 * Harness Types
 *
 * Formal type definitions for the ANNG CLI harness — the headless/CI–CD
 * execution layer that runs agent sessions without a TUI.
 *
 * Inspired by Cline's Config / ParsedArgs / CliOutputMode separation.
 */

// =============================================================================
// Agent execution modes
// =============================================================================

/**
 * AgentMode controls how the agent behaves at runtime:
 * - "act":     Full execution. The agent can create/edit files, run commands, etc.
 * - "plan":    Plan only. The agent analyses but does not mutate the workspace.
 * - "yolo":    Autonomous mode. All tool calls are auto-approved, no prompting.
 * - "zen":     Fire-and-forget. Dispatch to background, no TUI, no waiting.
 */
export type AgentMode = "act" | "plan" | "yolo" | "zen";

// =============================================================================
// Output modes for headless / CI–CD runs
// =============================================================================

export type OutputMode = "text" | "json";

// =============================================================================
// Reasoning effort
// =============================================================================

export type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";

// =============================================================================
// Harness Config – the single configuration object passed to every run fn
// =============================================================================

export interface HarnessConfig {
  /** Provider / model settings */
  providerId: string;
  modelId: string;
  apiKey: string;
  baseURL: string;

  /** Execution mode */
  mode: AgentMode;
  outputMode: OutputMode;

  /** System prompt overrides */
  systemPrompt?: string;

  /** Turns & timeouts */
  maxTurns: number;
  timeoutSeconds?: number;

  /** Workspace */
  cwd: string;
  workspaceRoot: string;

  /** Sanity / safety */
  consecutiveMistakeLimit: number; // e.g. 3
  autoApproveTools: boolean;

  /** Verbose output (text-mode stats) */
  verbose: boolean;

  /** Extra tool definitions (e.g. MCP) */
  extraTools?: unknown[];

  /** Environment variables forwarded to the agent */
  envVars?: Record<string, string>;
}

// =============================================================================
// JSON output event types (machine-readable)
// =============================================================================

export type JsonEventType =
  | "run_start"
  | "run_result"
  | "run_aborted"
  | "run_abort_requested"
  | "run_error"
  | "agent_event"
  | "tool_call"
  | "tool_result"
  | "error"
  | "zen_dispatched"
  | "zen_error";

export interface JsonEvent {
  ts: string;
  type: JsonEventType;
  [key: string]: unknown;
}

// =============================================================================
// Run result
// =============================================================================

export type FinishReason = "completed" | "aborted" | "error" | "max_turns" | "rate_limited";

export interface RunResult {
  finishReason: FinishReason;
  iterations: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    totalCost?: number;
  };
  text?: string;
  model?: string;
  durationMs: number;
}

// =============================================================================
// Active runtime (abort/cleanup registry)
// =============================================================================

export interface ActiveRuntime {
  abort: () => boolean;
  cleanup: () => Promise<void>;
}
