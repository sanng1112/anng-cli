/**
 * runAgent – Headless (non-interactive) agent execution
 *
 * This is the primary entry point for running an agent session without a TUI.
 * It is used for:
 * - `--yolo` / `--plan` single-prompt runs
 * - `--json` CI/CD pipelines
 * - piped-stdin execution
 *
 * The function:
 * 1. Resolves the system prompt from the active config
 * 2. Creates a SessionManager
 * 3. Starts the session with the user prompt
 * 4. Streams results back (text or JSON depending on outputMode)
 * 5. Handles abort (SIGINT/SIGTERM) and cleanup
 *
 * Inspired by Cline's runtime/run-agent.ts
 */

import type { HarnessConfig, RunResult } from "./types";
import { c, emitJson, formatDuration, formatTokens, formatUsd, writeErr, writeln } from "./output";
import { setActiveAbort, setActiveCleanup } from "./active-runtime";
import { SessionManager } from "../session";
import { createOpenAIClient } from "../common/openai-client";
// getRuntimeContext is no longer needed here — it's embedded in buildSystemPrompt()
// via the session's createSession() flow.
import { resolveCurrentSettings } from "../settings";

// =============================================================================
// runAgent
// =============================================================================

export async function runAgent(prompt: string, config: HarnessConfig): Promise<RunResult> {
  process.exitCode = 0;
  const startTime = performance.now();
  const isYolo = config.mode === "yolo";
  const isPlan = config.mode === "plan";
  const isJson = config.outputMode === "json";

  // ---------- Print startup info ----------

  if (isJson) {
    emitJson("run_start", {
      providerId: config.providerId,
      modelId: config.modelId,
      mode: config.mode,
    });
  } else if (config.verbose) {
    writeln(`${c.dim}[model] provider=${config.providerId} model=${config.modelId} mode=${config.mode}${c.reset}`);
  }

  // ---------- Resolve settings ----------

  const projectRoot = config.cwd;
  const settings = resolveCurrentSettings(projectRoot);

  // ---------- Create SessionManager ----------

  const sessionManager = new SessionManager({
    projectRoot,
    autoAccept: config.autoApproveTools || isYolo,
    planMode: isPlan,
    maxTurns: config.maxTurns,
    createOpenAIClient: () => createOpenAIClient(projectRoot),
    getResolvedSettings: () => ({
      model: settings.model,
      webSearchTool: settings.webSearchTool,
      mcpServers: settings.mcpServers,
      permissions: settings.permissions,
      enabledSkills: settings.enabledSkills,
      autoLinter: settings.autoLinter,
      fullPowerMode: settings.fullPowerMode,
    }),
    renderMarkdown: (text: string) => text,
    onAssistantMessage: () => {
      /* no TUI in headless mode */
    },
    onSessionEntryUpdated: () => {
      /* no TUI in headless mode */
    },
    onLlmStreamProgress: (progress) => {
      if (isJson && progress.phase === "start") {
        emitJson("agent_event", {
          event: "stream_start",
          requestId: progress.requestId,
        });
      }
    },
    onMcpStatusChanged: undefined,
    onProcessStdout: undefined,
  });

  await sessionManager.initMcpServers(settings.mcpServers);

  // ---------- Abort & signal handling ----------

  let abortRequested = false;
  let timedOut = false;

  const abortAll = (): boolean => {
    if (abortRequested) return false;
    abortRequested = true;
    sessionManager.interruptActiveSession();
    return true;
  };

  setActiveAbort(abortAll);

  let cleanupDone = false;
  const cleanup = async (): Promise<void> => {
    if (cleanupDone) return;
    cleanupDone = true;
    sessionManager.dispose();
    setActiveAbort(undefined);
    setActiveCleanup(undefined);
  };

  setActiveCleanup(() => cleanup());

  // Timeout
  const timeoutMs =
    typeof config.timeoutSeconds === "number" && config.timeoutSeconds > 0 ? config.timeoutSeconds * 1000 : undefined;
  const timeoutId = timeoutMs
    ? setTimeout(() => {
        timedOut = true;
        abortAll();
      }, timeoutMs)
    : undefined;

  // ---------- Execute ----------

  try {
    // Runtime context is embedded in the system prompt via buildSystemPrompt()
    // inside session's createSession(), so we only pass the user prompt here.
    await sessionManager.handleUserPrompt({
      text: prompt,
      skills: [],
    });

    if (abortRequested) {
      return handleAbort(config, isJson, timedOut, timeoutId, startTime);
    }

    const result = collectSessionResult(sessionManager, config, startTime);

    if (isJson) {
      emitJson("run_result", {
        finishReason: result.finishReason,
        iterations: result.iterations,
        usage: result.usage,
        durationMs: result.durationMs,
        text: result.text,
        model: result.model,
      });
    } else {
      if (result.text) writeln(result.text);
      if (config.verbose) {
        writeln(
          `${c.dim}[${formatDuration(result.durationMs)} | ${formatTokens(result.usage)}${result.usage.totalCost ? ` | ${formatUsd(result.usage.totalCost)}` : ""}]${c.reset}`
        );
      }
    }

    process.exitCode = result.finishReason === "completed" ? 0 : 1;
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isJson) {
      emitJson("run_error", { message, stack: err instanceof Error ? err.stack : undefined });
    } else {
      writeErr(message);
    }
    process.exitCode = 1;
    return {
      finishReason: "error",
      iterations: 0,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      durationMs: Math.round(performance.now() - startTime),
    };
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    await cleanup();
  }
}

// =============================================================================
// Internal helpers
// =============================================================================

function handleAbort(
  config: HarnessConfig,
  isJson: boolean,
  timedOut: boolean,
  _timeoutId: ReturnType<typeof setTimeout> | undefined,
  startTime: number
): RunResult {
  const reason = timedOut ? "timeout" : "user_interrupt";
  if (isJson) {
    emitJson("run_aborted", {
      reason,
      message: reason === "timeout" ? `run timed out after ${config.timeoutSeconds}s` : "aborted by user",
    });
  } else {
    writeln(
      `${c.dim}[abort] ${reason === "timeout" ? `timed out after ${config.timeoutSeconds}s` : "aborted by user"}${c.reset}`
    );
  }
  return {
    finishReason: "aborted",
    iterations: 0,
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    durationMs: Math.round(performance.now() - startTime),
  };
}

function collectSessionResult(sessionManager: SessionManager, config: HarnessConfig, startTime: number): RunResult {
  const sessionId = sessionManager.getActiveSessionId();
  const session = sessionId ? sessionManager.getSession(sessionId) : null;
  const usage = session?.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  const completed = session?.status === "completed" || session?.status === "interrupted";
  const finishReason: RunResult["finishReason"] = completed
    ? "completed"
    : session?.failReason?.includes("rate") || session?.failReason?.includes("quota")
      ? "rate_limited"
      : "error";

  return {
    finishReason,
    iterations: usage.total_reqs ?? 1,
    usage: {
      inputTokens: usage.prompt_tokens,
      outputTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
    },
    text: session?.assistantReply ?? "",
    model: config.modelId,
    durationMs: Math.round(performance.now() - startTime),
  };
}
