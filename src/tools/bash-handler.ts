import { spawn } from "child_process";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { DEFAULT_BASH_TIMEOUT_MS, clampBashTimeoutMs } from "../common/bash-timeout";
import { killProcessTree } from "../common/process-tree";
import type { ProcessTimeoutControl, ProcessTimeoutInfo, ToolExecutionContext, ToolExecutionResult } from "./executor";
import {
  buildDisableExtglobCommand,
  buildShellEnv,
  buildShellInitCommand,
  resolveShellPath,
  rewriteWindowsNullRedirect,
  toNativeCwd,
} from "../common/shell-utils";

const MAX_OUTPUT_CHARS = 30000;
const MAX_CAPTURE_CHARS = 10 * 1024 * 1024;
const BACKGROUND_OUTPUT_DIR = path.join(os.tmpdir(), "anng-background");
const TRAILING_BACKGROUND_OPERATOR_PATTERN = /(^|[^\\&])\s*&\s*$/;
const sessionWorkingDirs = new Map<string, string>();

export function clearSessionWorkingDir(sessionId: string): void {
  if (!sessionId) {
    return;
  }
  sessionWorkingDirs.delete(sessionId);
}

type ToolCommandResult = {
  ok: boolean;
  output: string;
  cwd: string | null;
  exitCode: number | null;
  signal: string | null;
  truncated: boolean;
  shellPath?: string;
  startCwd?: string;
  timedOut?: boolean;
  timeoutMs?: number;
  deadlineAt?: string;
};

export async function handleBashTool(
  args: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const rawCommand = typeof args.command === "string" ? args.command : "";
  const runInBackground = isTrue(args.run_in_background);
  const command = runInBackground ? stripTrailingBackgroundOperator(rawCommand) : rawCommand;
  if (!command.trim()) {
    return {
      ok: false,
      name: "bash",
      error: 'Missing required "command" string.',
    };
  }

  const startCwd = getSessionCwd(context.sessionId, context.projectRoot);
  const { shellPath, shellArgs, marker } = buildShellCommand(command);

  if (runInBackground) {
    return startBackgroundShellCommand(shellPath, shellArgs, startCwd, command, marker, context);
  }

  const execution = await executeShellCommand(shellPath, shellArgs, startCwd, command, context);
  const result = await buildToolCommandResult(
    execution.stdout,
    execution.stderr,
    marker,
    execution.exitCode,
    execution.signal,
    shellPath,
    startCwd,
    command,
    context.projectRoot,
    execution.timedOut,
    execution.timeoutMs,
    execution.deadlineAtMs
  );
  updateSessionCwd(context.sessionId, startCwd, result.cwd);

  if (execution.error || result.exitCode !== 0 || result.signal !== null) {
    const errorMessage = buildErrorMessage(result.exitCode, result.signal, execution.error, execution.timedOut);
    return formatResult({ ...result, ok: false }, "bash", errorMessage);
  }

  return formatResult(result, "bash");
}

function isTrue(value: unknown): boolean {
  return value === true || value === "true";
}

function stripTrailingBackgroundOperator(command: string): string {
  return command.replace(TRAILING_BACKGROUND_OPERATOR_PATTERN, "$1").trimEnd();
}

function getSessionCwd(sessionId: string, fallback: string): string {
  return sessionWorkingDirs.get(sessionId) ?? fallback;
}

function updateSessionCwd(sessionId: string, fallback: string, cwd: string | null): void {
  const nextCwd = cwd ?? fallback;
  sessionWorkingDirs.set(sessionId, nextCwd);
}

function buildShellCommand(command: string): {
  shellPath: string;
  shellArgs: string[];
  marker: string;
} {
  const shellPath = resolveShellPath();
  const marker = buildMarker();
  const initCommand = buildShellInitCommand(shellPath);
  const disableExtglobCommand = buildDisableExtglobCommand(shellPath);
  const normalizedCommand = rewriteWindowsNullRedirect(command);
  const wrappedParts = [];
  if (initCommand) {
    wrappedParts.push(initCommand);
  }
  if (disableExtglobCommand) {
    wrappedParts.push(disableExtglobCommand);
  }
  wrappedParts.push(
    normalizedCommand,
    "__ANNG_STATUS__=$?",
    `printf '%s%s\\n' "${marker}" "$PWD"`,
    "exit $__ANNG_STATUS__"
  );
  const wrappedCommand = `{ ${wrappedParts.join("; ")}; } < /dev/null`;
  return { shellPath, shellArgs: ["-c", wrappedCommand], marker };
}

async function executeShellCommand(
  shellPath: string,
  shellArgs: string[],
  cwd: string,
  _command: string,
  context: ToolExecutionContext
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  error?: string;
  timedOut: boolean;
  timeoutMs: number;
  deadlineAtMs: number;
}> {
  return new Promise((resolve) => {
    const detached = process.platform !== "win32";
    const configuredEnv = context.createOpenAIClient?.().env ?? {};
    const minTimeoutMs = context.bashMinTimeoutMs;
    const initialTimeoutMs = clampBashTimeoutMs(context.bashTimeoutMs ?? DEFAULT_BASH_TIMEOUT_MS, minTimeoutMs);
    const startedAtMs = Date.now();
    let timeoutMs = initialTimeoutMs;
    let deadlineAtMs = startedAtMs + timeoutMs;
    let timedOut = false;
    let settled = false;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    const child = spawn(shellPath, shellArgs, {
      cwd,
      env: buildShellEnv(shellPath, configuredEnv),
      detached,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const pid = child.pid;

    const getTimeoutInfo = (): ProcessTimeoutInfo => ({
      timeoutMs,
      startedAtMs,
      deadlineAtMs,
      timedOut,
    });
    const stopTimeoutTimer = () => {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
    };
    const triggerTimeout = () => {
      if (settled || timedOut || typeof pid !== "number") {
        return;
      }
      timedOut = true;
      stopTimeoutTimer();
      killProcessTree(pid, "SIGKILL");
    };
    const scheduleTimeout = () => {
      stopTimeoutTimer();
      if (settled) {
        return;
      }
      const remainingMs = Math.max(0, deadlineAtMs - Date.now());
      timeoutTimer = setTimeout(triggerTimeout, remainingMs);
    };
    const timeoutControl: ProcessTimeoutControl = {
      getInfo: getTimeoutInfo,
      setTimeoutMs: (nextTimeoutMs) => {
        timeoutMs = clampBashTimeoutMs(nextTimeoutMs, minTimeoutMs);
        deadlineAtMs = startedAtMs + timeoutMs;
        if (deadlineAtMs <= Date.now()) {
          triggerTimeout();
        } else {
          scheduleTimeout();
        }
        return getTimeoutInfo();
      },
    };

    if (typeof pid === "number") {
      context.onProcessStart?.(pid, command);
      context.onProcessTimeoutControl?.(pid, timeoutControl);
      scheduleTimeout();
    }

    let stdout = "";
    let stderr = "";
    let error: string | undefined;

    child.stdout?.on("data", (chunk: string | Buffer) => {
      stdout = appendChunk(stdout, chunk);
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      context.onProcessStdout?.(pid as number, text);
    });
    child.stderr?.on("data", (chunk: string | Buffer) => {
      stderr = appendChunk(stderr, chunk);
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      context.onProcessStdout?.(pid as number, text);
    });

    child.on("error", (spawnError) => {
      error = spawnError.message;
    });

    child.on("close", (code, signal) => {
      settled = true;
      stopTimeoutTimer();
      if (typeof pid === "number") {
        context.onProcessTimeoutControl?.(pid, null);
        context.onProcessExit?.(pid);
      }
      resolve({
        stdout,
        stderr,
        exitCode: typeof code === "number" ? code : null,
        signal: signal ?? null,
        error,
        timedOut,
        timeoutMs,
        deadlineAtMs,
      });
    });
  });
}

function startBackgroundShellCommand(
  shellPath: string,
  shellArgs: string[],
  cwd: string,
  _command: string,
  marker: string,
  context: ToolExecutionContext
): ToolExecutionResult {
  fs.mkdirSync(BACKGROUND_OUTPUT_DIR, { recursive: true });
  const taskId = `bash-${randomUUID()}`;
  const outputPath = path.join(BACKGROUND_OUTPUT_DIR, `${taskId}.log`);
  const startedAtMs = Date.now();
  const detached = process.platform !== "win32";
  const configuredEnv = context.createOpenAIClient?.().env ?? {};
  const child = spawn(shellPath, shellArgs, {
    cwd,
    env: buildShellEnv(shellPath, configuredEnv),
    detached,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const pid = child.pid;
  const processId = typeof pid === "number" ? pid : -1;
  const stopCommand = typeof pid === "number" ? buildStopBackgroundProcessCommand(pid) : null;

  let stdout = "";
  let stderr = "";
  let error: string | undefined;

  const appendOutputFile = (chunk: string | Buffer) => {
    try {
      fs.appendFileSync(outputPath, chunk);
    } catch {
      // Keep the background process running even if temp-file writes fail.
    }
  };

  if (typeof pid === "number") {
    context.onProcessStart?.(pid, command);
  }

  child.stdout?.on("data", (chunk: string | Buffer) => {
    stdout = appendChunk(stdout, chunk);
    appendOutputFile(chunk);
    const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    if (typeof pid === "number") {
      context.onProcessStdout?.(pid, text);
    }
  });
  child.stderr?.on("data", (chunk: string | Buffer) => {
    stderr = appendChunk(stderr, chunk);
    appendOutputFile(chunk);
    const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    if (typeof pid === "number") {
      context.onProcessStdout?.(pid, text);
    }
  });

  child.on("error", (spawnError) => {
    error = spawnError.message;
  });

  child.on("close", async (code, signal) => {
    const markerResult = stripMarker(stdout, marker);
    const finalOutput = joinOutput(markerResult.output, stderr);
    const result = await buildToolCommandResult(
      stdout,
      stderr,
      marker,
      typeof code === "number" ? code : null,
      signal ?? null,
      shellPath,
      cwd,
      command,
      context.projectRoot
    );
    updateSessionCwd(context.sessionId, cwd, result.cwd);
    writeFinalBackgroundOutput(outputPath, finalOutput);
    if (typeof pid === "number") {
      context.onProcessExit?.(pid);
    }
    const ok = !error && result.exitCode === 0 && result.signal === null;
    context.onBackgroundProcessComplete?.({
      taskId,
      processId,
      command,
      outputPath,
      ok,
      exitCode: result.exitCode,
      signal: result.signal,
      error: ok ? undefined : buildErrorMessage(result.exitCode, result.signal, error),
      cwd: result.cwd,
      shellPath,
      startedAtMs,
      completedAtMs: Date.now(),
    });
  });

  return {
    ok: true,
    name: "bash",
    output: buildBackgroundStartMessage(taskId, outputPath, stopCommand),
    metadata: {
      backgroundTaskId: taskId,
      processId: typeof pid === "number" ? pid : null,
      outputPath,
      stopCommand,
      cwd,
      shellPath,
      startCwd: cwd,
      runInBackground: true,
    },
  };
}

function buildBackgroundStartMessage(taskId: string, outputPath: string, stopCommand: string | null): string {
  const parts = [`Command running in background with ID: ${taskId}.`];
  if (stopCommand) {
    parts.push(`Stop it with: ${stopCommand}`);
  }
  parts.push(`Output is being written to: ${outputPath}`);
  return parts.join(" ");
}

function buildStopBackgroundProcessCommand(processId: number): string {
  if (process.platform === "win32") {
    return `cmd.exe /c "taskkill /PID ${processId} /T /F"`;
  }
  return `kill -- -${processId}`;
}

function writeFinalBackgroundOutput(outputPath: string, output: string | undefined): void {
  try {
    fs.writeFileSync(outputPath, output ?? "", "utf8");
  } catch {
    // Ignore notification/output persistence failures; the tool result already returned.
  }
}

function appendChunk(existing: string, chunk: string | Buffer): string {
  if (existing.length >= MAX_CAPTURE_CHARS) {
    return existing;
  }
  const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
  const remaining = MAX_CAPTURE_CHARS - existing.length;
  return `${existing}${text.slice(0, remaining)}`;
}

function buildMarker(): string {
  const token = Math.random().toString(36).slice(2);
  return `__ANNG_PWD__${token}__`;
}

async function buildToolCommandResult(
  stdout: string,
  stderr: string,
  marker: string,
  exitCode: number | null,
  signal: string | null,
  shellPath: string,
  startCwd: string,
  _command: string,
  _projectRoot: string,
  timedOut: boolean = false,
  timeoutMs?: number,
  deadlineAtMs?: number
): Promise<ToolCommandResult> {
  const { output: cleanedStdout, cwd } = stripMarker(stdout, marker);
  const combined = joinOutput(cleanedStdout, stderr);
  const { text, truncated } = await truncateOutput(combined, command, projectRoot);
  return {
    ok: exitCode === 0 && signal === null,
    output: text,
    cwd,
    exitCode,
    signal,
    truncated,
    shellPath,
    startCwd,
    timedOut,
    timeoutMs,
    deadlineAt: typeof deadlineAtMs === "number" ? new Date(deadlineAtMs).toISOString() : undefined,
  };
}

function stripMarker(stdout: string, marker: string): { output: string; cwd: string | null } {
  if (!stdout) {
    return { output: "", cwd: null };
  }

  const lines = stdout.split(/\r?\n/);
  let markerIndex = -1;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i].startsWith(marker)) {
      markerIndex = i;
      break;
    }
  }

  if (markerIndex === -1) {
    return { output: stdout, cwd: null };
  }

  const markerLine = lines[markerIndex];
  const shellCwd = markerLine.slice(marker.length).trim();
  const cwd = shellCwd ? toNativeCwd(shellCwd) : null;
  lines.splice(markerIndex, 1);
  return { output: lines.join("\n"), cwd };
}

function joinOutput(stdout: string, stderr: string): string {
  const trimmedStdout = stdout ?? "";
  const trimmedStderr = stderr ?? "";
  let combined = trimmedStdout;
  if (trimmedStdout && trimmedStderr) {
    combined = `${trimmedStdout}\n${trimmedStderr}`;
  } else if (!trimmedStdout && trimmedStderr) {
    combined = trimmedStderr;
  }
  return combined
    .replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "")
    .replace(/\n{3,}/g, "\n\n");
}

async function truncateOutput(
  output: string,
  _command: string,
  _projectRoot: string
): Promise<{ text: string; truncated: boolean }> {
  if (output.length <= MAX_OUTPUT_CHARS) {
    // Additionally check if there are too many lines
    const lines = output.split(/\r?\n/);
    if (lines.length <= 200) {
      return { text: output, truncated: false };
    }
  }

  const lines = output.split(/\r?\n/);
  if (lines.length <= 200) {
    // If it's few lines but long chars, just do a simple character slice
    const half = Math.floor(MAX_OUTPUT_CHARS / 2);
    const head = output.slice(0, half);
    const tail = output.slice(-half);
    return {
      text: `${head}\n\n...[OUTPUT TRUNCATED: ${output.length - MAX_OUTPUT_CHARS} chars omitted]...\n\n${tail}`,
      truncated: true,
    };
  }

  // Line-based truncation: first 50 lines and last 50 lines
  const headLines = lines.slice(0, 50).join("\n");
  const tailLines = lines.slice(-50).join("\n");
  const omittedCount = lines.length - 100;

  return {
    text: `${headLines}\n\n...[OUTPUT TRUNCATED: ${omittedCount} lines omitted]...\n\n${tailLines}`,
    truncated: true,
  };
}

function buildErrorMessage(exitCode: number | null, signal: string | null, error?: string, timedOut = false): string {
  if (error) {
    return error;
  }
  if (timedOut) {
    return "Command timed out.";
  }
  if (signal) {
    return `Command terminated by signal ${signal}.`;
  }
  if (exitCode !== null) {
    return `Command failed with exit code ${exitCode}.`;
  }
  return "Command failed.";
}

function formatResult(result: ToolCommandResult, name: string, errorMessage?: string): ToolExecutionResult {
  const metadata: Record<string, unknown> = {
    exitCode: result.exitCode,
    signal: result.signal,
    cwd: result.cwd,
    truncated: result.truncated,
    shellPath: result.shellPath,
    startCwd: result.startCwd,
  };
  if (typeof result.timedOut === "boolean") metadata.timedOut = result.timedOut;
  if (typeof result.timeoutMs === "number") metadata.timeoutMs = result.timeoutMs;
  if (result.deadlineAt) metadata.deadlineAt = result.deadlineAt;

  const outputValue = result.output ? result.output : undefined;

  let status: "success" | "warning" | "error" = result.ok ? "success" : "error";
  let summary = result.ok ? "Command executed successfully." : "Command failed.";
  let nextActions: string[] | undefined = undefined;

  if (!result.ok) {
    const analysis = analyzeBashError(result.exitCode, result.signal, errorMessage, result.timedOut ?? false);
    status = analysis.status;
    summary = analysis.summary;
    nextActions = analysis.nextActions;
  }

  return {
    ok: result.ok,
    name,
    output: outputValue,
    error: errorMessage,
    metadata,
    status,
    summary,
    nextActions,
  };
}

function analyzeBashError(
  exitCode: number | null,
  signal: string | null,
  error?: string,
  timedOut: boolean = false
): {
  status: "warning" | "error";
  summary: string;
  nextActions: string[];
} {
  const summary = buildErrorMessage(exitCode, signal, error, timedOut);
  const nextActions: string[] = [];
  let status: "warning" | "error" = "error";

  if (summary.includes("timed out")) {
    status = "warning";
    nextActions.push("Retry with a longer timeout by passing bashTimeoutMs in context.");
    nextActions.push("Check if the command is waiting for interactive input.");
  } else if (exitCode === 127) {
    nextActions.push("Command not found. Verify your PATH or install the missing dependency.");
  } else if (exitCode === 1) {
    nextActions.push("General error. Read the output closely for root cause.");
    nextActions.push("If it's a missing module, consider installing it.");
  } else {
    nextActions.push("Review stderr output.");
    nextActions.push("Ensure you have correct permissions and the environment is properly set.");
  }

  return { status, summary, nextActions };
}
