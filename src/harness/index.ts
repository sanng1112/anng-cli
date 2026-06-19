/**
 * Harness Module
 *
 * The harness is the headless / CI–CD execution layer of ANNG CLI.
 * It provides formal abstractions for running agent sessions without a TUI:
 *
 * ```
 * import { runAgent, runWorker, setOutputMode } from "./harness";
 *
 * setOutputMode("json");
 * const result = await runAgent("fix this bug", {
 *   providerId: "openai",
 *   modelId: "gpt-4o",
 *   apiKey: "...",
 *   baseURL: "https://api.openai.com/v1",
 *   mode: "yolo",
 *   outputMode: "json",
 *   maxTurns: 25,
 *   cwd: process.cwd(),
 *   workspaceRoot: process.cwd(),
 *   consecutiveMistakeLimit: 3,
 *   autoApproveTools: true,
 *   verbose: true,
 * });
 * ```
 */

export type {
  AgentMode,
  OutputMode,
  ReasoningEffort,
  HarnessConfig,
  JsonEventType,
  JsonEvent,
  RunResult,
  FinishReason,
  ActiveRuntime,
} from "./types";

export {
  setOutputMode,
  getOutputMode,
  c,
  emitJson,
  writeln,
  writeErr,
  writeDiagnostic,
  formatDuration,
  formatTokens,
  formatUsd,
} from "./output";

export {
  setActiveAbort,
  setActiveCleanup,
  abortActiveRuntime,
  cleanupActiveRuntime,
  markAbortInProgress,
  clearAbortInProgress,
  isAbortInProgress,
  installSignalHandlers,
} from "./active-runtime";

export { runAgent } from "./run-agent";
