import * as fs from "fs";
import * as path from "path";
import React from "react";
import { render } from "ink";
import { setShellIfWindows } from "./common/shell-utils";
import { checkForNpmUpdate, promptForPendingUpdate, type PackageInfo } from "./common/update-check";
import { AppContainer } from "./ui";

const args = process.argv.slice(2);
const packageInfo = readPackageInfo();

if (args.includes("--version") || args.includes("-v")) {
  process.stdout.write(`${packageInfo.version || "unknown"}\n`);
  process.exit(0);
}

if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(
    [
      "anng - ANNG CLI CLI",
      "",
      "Usage:",
      "  anng                              Launch the interactive TUI in the current directory",
      "  anng -p <prompt>                  Launch with a pre-filled prompt",
      "  anng --yolo -p <prompt>           Headless mode: auto-accept all permissions",
      "  anng --plan                       Plan mode: ask for confirmation for all tool calls",
      "  anng --yolo --max-turns 10 -p <p> Headless with turn limit",
      "  anng --team -p <prompt>               Team mode: dispatch task to multiple agents",
      "  anng --team --tmux -p <prompt>        Team mode with tmux visual panels",
      "  anng --team --team-workers 8 -p <...>  Team mode with 8 parallel workers",
      "  anng --version                    Print the version",
      "  anng --help                       Show this help",
      "",
      "Configuration:",
      "  ~/.anng/settings.json    User-level API key, model, base URL",
      "  ./.anng/settings.json    Project-level settings",
      "  ./.anng/skills/*/SKILL.md Project-level native skills",
      "  ./.agents/skills/*/SKILL.md   Project-level interoperable skills",
      "  ~/.anng/skills/*/SKILL.md User-level native skills",
      "  ~/.agents/skills/*/SKILL.md   User-level interoperable skills",
      "",
      "Inside the TUI:",
      "  enter            Send the prompt",
      "  shift+enter      Insert a newline",
      "  home/end         Move within the current line",
      "  alt+left/right   Move by word",
      "  ctrl+w           Delete the previous word",
      "  ctrl+v           Paste an image from the clipboard",
      "  ctrl+x           Clear pasted images",
      "  esc              Interrupt the current model turn",
      "  /                Open the skills/commands menu",
      "  /skills          List available skills",
      "  /model           Select model, thinking mode and effort control",
      "  /new             Start a fresh conversation",
      "  /init            Initialize an AGENTS.md file with instructions for LLM",
      "  /resume          Pick a previous conversation to continue",
      "  /continue        Continue the active conversation, or resume one if empty",
      "  /undo            Restore code and/or conversation to a previous point",
      "  /mcp             Show MCP server status and available tools",
      "  /raw             Toggle display mode for viewing or collapsing reasoning content",
      "  /exit            Quit",
      "  ctrl+c twice     Quit",
    ].join("\n") + "\n"
  );
  process.exit(0);
}

function extractInitialPrompt(args: string[]): string | undefined {
  const promptIndex = args.findIndex((arg) => arg === "-p" || arg === "--prompt");
  if (promptIndex !== -1 && promptIndex + 1 < args.length) {
    return args[promptIndex + 1];
  }
  return undefined;
}

function extractArgValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index !== -1 && index + 1 < args.length) {
    return args[index + 1];
  }
  return undefined;
}

function loadTaskQueue(rootPath: string): string | undefined {
  const taskPath = path.join(rootPath, ".anng", "memory", "task-queue.md");
  try {
    if (fs.existsSync(taskPath)) {
      return `Please process the following persistent task queue:\n\n${fs.readFileSync(taskPath, "utf8")}`;
    }
  } catch {
    // Ignore read errors
  }
  return undefined;
}

let initialPrompt = extractInitialPrompt(args);

// Harness flags for headless CI/CD execution
const autoAcceptEnabled = args.includes("--yolo") || args.includes("-y");
const planModeEnabled = args.includes("--plan");

// Team orchestration flags
const teamMode = args.includes("--team");
const teamTmux = args.includes("--tmux");
const teamWorkers = parseInt(extractArgValue(args, "--team-workers") ?? "4", 10);
const teamModeValue = extractArgValue(args, "--team-mode");

if (autoAcceptEnabled && !initialPrompt) {
  initialPrompt = loadTaskQueue(process.cwd());
}
const maxTurnsArgIndex = args.indexOf("--max-turns");
const maxTurns = maxTurnsArgIndex !== -1 ? Math.max(1, parseInt(args[maxTurnsArgIndex + 1], 10) || 25) : 25;
const isHeadless = autoAcceptEnabled;

const projectRoot = process.cwd();
configureWindowsShell();

if (!process.stdin.isTTY) {
  process.stderr.write("anng requires an interactive terminal (TTY). " + "Re-run from a real terminal session.\n");
  process.exit(1);
}

void main();

async function main(): Promise<void> {
  const updatePromptResult = await promptForPendingUpdate(packageInfo);
  if (updatePromptResult.installed) {
    process.exit(0);
  }

  const restartRef: { current: (() => void) | null } = { current: null };

  function startApp(): void {
    let restarting = false;
    const appInitialPrompt = initialPrompt;
    initialPrompt = undefined;
    const inkInstance = render(
      <AppContainer
        projectRoot={projectRoot}
        version={packageInfo.version}
        initialPrompt={appInitialPrompt}
        autoAccept={autoAcceptEnabled}
        planMode={planModeEnabled}
        maxTurns={maxTurns}
        headless={isHeadless}
        onRestart={() => restartRef.current?.()}
        teamMode={teamMode}
        teamConfig={{
          mode: teamTmux ? "tmux" : (teamModeValue ?? "internal"),
          maxParallelWorkers: teamWorkers,
        }}
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
    const pkg = require("../package.json") as { name?: unknown; version?: unknown };
    return {
      name: typeof pkg.name === "string" ? pkg.name : "anng-cli",
      version: typeof pkg.version === "string" ? pkg.version : "",
    };
  } catch {
    return { name: "anng-cli", version: "" };
  }
}
