/**
 * ANNG CLI Entry Point
 *
 * Refactored to use the formal Harness module for all headless /
 * CI–CD execution paths. The interactive TUI path remains unchanged.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import React from "react";
import { render } from "ink";
import { setShellIfWindows } from "./common/shell-utils";
import { checkForNpmUpdate, promptForPendingUpdate, type PackageInfo } from "./common/update-check";
import { AppContainer } from "./ui";
import { setOutputMode, runAgent, installSignalHandlers, writeErr } from "./harness";
import type { AgentMode, OutputMode, HarnessConfig, RunResult } from "./harness";
import { resolveCurrentSettings } from "./settings";

// =============================================================================
// Argument parsing
// =============================================================================

const args = process.argv.slice(2);
const packageInfo = readPackageInfo();

// --- Quick flags ---

if (args.includes("--version") || args.includes("-v")) {
  process.stdout.write(`${packageInfo.version || "unknown"}\n`);
  process.exit(0);
}

if (args.includes("--help") || args.includes("-h")) {
  printHelp(packageInfo.name ?? "anng-cli");
  process.exit(0);
}

// --- Extract helpers ---

function extractPrompt(args: string[]): string | undefined {
  const idx = args.findIndex((a) => a === "-p" || a === "--prompt");
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

function extractFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

function hasFlag(args: string[], ...flags: string[]): boolean {
  return flags.some((f) => args.includes(f));
}

// --- Parse args ---

const initialPrompt = extractPrompt(args);
const outputMode: OutputMode = hasFlag(args, "--json") ? "json" : "text";
const mode: AgentMode = hasFlag(args, "--plan")
  ? "plan"
  : hasFlag(args, "--yolo", "-y")
    ? "yolo"
    : hasFlag(args, "--zen")
      ? "zen"
      : "act";

const maxTurns = parseInt(extractFlag(args, "--max-turns") ?? "25", 10);
const verbose = hasFlag(args, "--verbose");

const projectRoot = process.cwd();
configureWindowsShell();
setOutputMode(outputMode);
const uninstallSignals = installSignalHandlers();

// --- Task queue fallback for headless ---
const effectivePrompt = initialPrompt ?? loadTaskQueue(projectRoot);

if (!process.stdin.isTTY) {
  writeErr("anng requires an interactive terminal (TTY). Re-run from a real terminal session.");
  process.exit(1);
}

void main();

async function main(): Promise<void> {
  const updateResult = await promptForPendingUpdate(packageInfo);
  if (updateResult.installed) process.exit(0);

  // ============ HEADLESS MODES (yolo, plan, json, zen) ============
  if (mode === "yolo" || mode === "plan" || mode === "zen" || outputMode === "json") {
    const result = await runHeadless(effectivePrompt);
    uninstallSignals();
    process.exit(result.finishReason === "completed" ? 0 : 1);
  }

  // ============ INTERACTIVE TUI ============
  await startInteractiveTUI();
}

// =============================================================================
// Headless execution
// =============================================================================

async function runHeadless(prompt: string | undefined): Promise<RunResult> {
  const settings = resolveCurrentSettings(projectRoot);

  const config: HarnessConfig = {
    providerId: settings.env.API_KEY ?? "default",
    modelId: settings.model,
    apiKey: settings.apiKey ?? "",
    baseURL: settings.baseURL,
    mode,
    outputMode,
    maxTurns,
    cwd: projectRoot,
    workspaceRoot: projectRoot,
    consecutiveMistakeLimit: 3,
    autoApproveTools: mode === "yolo" || mode === "zen",
    verbose,
    envVars: settings.env,
  };

  if (!prompt) {
    writeErr("No prompt provided. Use -p <prompt> to specify a task.");
    return {
      finishReason: "error",
      iterations: 0,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      durationMs: 0,
    };
  }

  return runAgent(prompt, config);
}

// =============================================================================
// Interactive TUI
// =============================================================================

async function startInteractiveTUI(): Promise<void> {
  const restartRef: { current: (() => void) | null } = { current: null };

  function startApp(): void {
    let restarting = false;
    const appP = effectivePrompt;
    const inkInstance = render(
      <AppContainer
        projectRoot={projectRoot}
        version={packageInfo.version}
        initialPrompt={appP}
        autoAccept={hasFlag(args, "--yolo", "-y")}
        planMode={hasFlag(args, "--plan")}
        maxTurns={maxTurns}
        headless={false}
        onRestart={() => restartRef.current?.()}
      />,
      { exitOnCtrlC: false }
    );

    restartRef.current = () => {
      restarting = true;
      process.stdout.write("\u001B[2J\u001B[3J\u001B[H");
      inkInstance.unmount();
      startApp();
    };

    inkInstance.waitUntilExit().then(() => {
      if (!restarting) {
        restartRef.current = null;
        process.exit(0);
      }
    });
  }

  void checkForNpmUpdate(packageInfo);
  startApp();
}

// =============================================================================
// Utilities
// =============================================================================

function loadTaskQueue(rootPath: string): string | undefined {
  const taskPath = path.join(rootPath, ".anng", "memory", "task-queue.md");
  try {
    if (fs.existsSync(taskPath)) {
      return `Please process the following persistent task queue:\n\n${fs.readFileSync(taskPath, "utf8")}`;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

function configureWindowsShell(): void {
  process.env.NoDefaultCurrentDirectoryInExePath = "1";
  try {
    setShellIfWindows();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`anng: ${message}\n`);
    process.exit(1);
  }
}

function readPackageInfo(): PackageInfo {
  try {
    const currentFilePath = fileURLToPath(import.meta.url);
    const currentDir = path.dirname(currentFilePath);
    const pkgPath = path.resolve(currentDir, "../package.json");
    const pkgContent = fs.readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(pkgContent) as { name?: unknown; version?: unknown };
    return {
      name: typeof pkg.name === "string" ? pkg.name : "anng-cli",
      version: typeof pkg.version === "string" ? pkg.version : "",
    };
  } catch {
    return { name: "anng-cli", version: "" };
  }
}

function printHelp(name: string): void {
  process.stdout.write(
    [
      `${name} - ANNG CLI`,
      "",
      "Usage:",
      "  anng                              Launch the interactive TUI",
      "  anng -p <prompt>                  Launch with a pre-filled prompt",
      "  anng --yolo -p <prompt>           Headless: auto-accept all permissions",
      "  anng --plan -p <prompt>           Plan mode: ask before tool calls",
      "  anng --json -p <prompt>           JSON output for CI/CD pipelines",
      "  anng --zen -p <prompt>            Fire-and-forget background execution",
      "  anng --yolo --max-turns 10 -p <p> Headless with turn limit",
      "  anng --version                    Print version",
      "  anng --help                       Show this help",
      "",
      "Output modes:",
      "  --json          Machine-readable JSON lines on stdout",
      "  --verbose       Detailed progress output",
      "",
      "Configuration:",
      "  ~/.anng/settings.json         User-level settings",
      "  ./.anng/settings.json         Project-level settings",
      "  ./.anng/skills/*/SKILL.md     Project-level native skills",
      "  ./.agents/skills/*/SKILL.md   Project-level interoperable skills",
      "",
      "Inside the TUI:",
      "  enter            Send the prompt",
      "  shift+enter      Insert a newline",
      "  esc              Interrupt the current model turn",
      "  /                Open the skills/commands menu",
      "  /model           Select model and reasoning effort",
      "  /new             Start a fresh conversation",
      "  /resume          Pick a previous conversation to continue",
      "  /undo            Restore code/conversation to a previous point",
      "  /mcp             Show MCP server status and tools",
      "  /exit            Quit",
      "  ctrl+c twice     Quit",
    ].join("\n") + "\n"
  );
}
