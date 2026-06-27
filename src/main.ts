import { collectLegacyCliWarnings, parseCliArgs, type ParsedCliArgs } from "./commands/program";
import { readConfigSummary } from "./commands/config";
import { runDaemonCommand } from "./commands/daemon";
import { runDoctorCommand } from "./commands/doctor";
import { readHelpText } from "./commands/help";
import { runMcpCommand } from "./commands/mcp";
import { runSessionsCommand } from "./commands/sessions";
import { ensureStartupSettingsMigration, type StartupMigrationResult } from "./core/config/settings-startup";
import { runAgent as runAgentRuntime } from "./runtime/run-agent";
import { runDaemon as runDaemonRuntime } from "./runtime/run-daemon";
import { runInteractive as runInteractiveRuntime } from "./runtime/run-interactive";
import { ANNG_CLI_VERSION } from "./version";
import { runTeamRuntime } from "./core/team/team-runtime";
import { type DaemonManifest } from "./core/team/daemon-state";
import * as fs from "node:fs";

export type RunCliHooks = {
  launchInteractive?: (args: ParsedCliArgs) => Promise<void>;
  runOneShot?: (args: ParsedCliArgs) => Promise<void>;
  runTeam?: (args: ParsedCliArgs) => Promise<void>;
  migrateSettings?: (cwd: string) => Promise<StartupMigrationResult>;
  writeStderr?: (text: string) => void;
  writeStdout?: (text: string) => void;
};

function buildRuntimeEnvOverrides(args: ParsedCliArgs): Record<string, string> {
  const overrides: Record<string, string> = {};

  if (args.provider) {
    overrides.ANNG_PROVIDER = args.provider;
  }
  if (args.model) {
    overrides.ANNG_MODEL = args.model;
  }
  if (args.key) {
    overrides.ANNG_API_KEY = args.key;
  }
  if (args.baseUrl) {
    overrides.ANNG_BASE_URL = args.baseUrl;
  }

  return overrides;
}

function applyRuntimeEnvOverrides(overrides: Record<string, string>): void {
  for (const [key, value] of Object.entries(overrides)) {
    process.env[key] = value;
  }
}

async function defaultLaunchInteractive(_args: ParsedCliArgs): Promise<void> {
  if (_args.configDir) {
    process.env.ANNG_HOME = _args.configDir;
  }

  applyRuntimeEnvOverrides(buildRuntimeEnvOverrides(_args));

  await runInteractiveRuntime({
    cwd: _args.cwd ?? process.cwd(),
    prompt: _args.prompt,
    autoAccept: _args.mode === "yolo",
    planMode: _args.mode === "plan",
    provider: _args.provider,
    model: _args.model,
    key: _args.key,
    baseUrl: _args.baseUrl,
    teamMode: _args.anngTeam,
    teamTmux: _args.anngTmux,
  });
}

async function defaultRunOneShot(args: ParsedCliArgs): Promise<void> {
  if (!args.prompt) {
    return;
  }

  if (args.configDir) {
    process.env.ANNG_HOME = args.configDir;
  }

  applyRuntimeEnvOverrides(buildRuntimeEnvOverrides(args));

  await runAgentRuntime({
    prompt: args.prompt,
    cwd: args.cwd ?? process.cwd(),
    outputMode: args.outputMode,
    model: args.model,
    provider: args.provider,
    key: args.key,
    baseUrl: args.baseUrl,
    timeoutSeconds: args.timeoutSeconds,
    autoAccept: args.mode === "yolo",
    planMode: args.mode === "plan",
  });
}

async function defaultRunTeam(args: ParsedCliArgs): Promise<void> {
  if (!args.prompt) {
    return;
  }
  await runTeamRuntime({
    prompt: args.prompt,
    cwd: args.cwd ?? process.cwd(),
    tmux: args.anngTmux,
  });
}

export async function runCli(argv = process.argv.slice(2), hooks: RunCliHooks = {}): Promise<void> {
  const parsed = parseCliArgs(argv);
  const launchInteractive = hooks.launchInteractive ?? defaultLaunchInteractive;
  const runOneShot = hooks.runOneShot ?? defaultRunOneShot;
  const runTeam = hooks.runTeam ?? defaultRunTeam;
  const migrateSettings = hooks.migrateSettings ?? ensureStartupSettingsMigration;
  const writeStderr = hooks.writeStderr ?? ((text: string) => process.stderr.write(text));
  const writeStdout = hooks.writeStdout ?? ((text: string) => process.stdout.write(text));

  if (parsed.unknownFlags.length > 0) {
    throw new Error(`Unknown flags: ${parsed.unknownFlags.join(", ")}`);
  }

  if (parsed.help) {
    writeStdout(`${readHelpText()}\n`);
    return;
  }

  if (parsed.version) {
    writeStdout(`${ANNG_CLI_VERSION}\n`);
    return;
  }

  if (parsed.configDir) {
    process.env.ANNG_HOME = parsed.configDir;
  }

  applyRuntimeEnvOverrides(buildRuntimeEnvOverrides(parsed));

  for (const warning of collectLegacyCliWarnings(argv)) {
    writeStderr(`${warning.message}\n`);
  }

  const migration = await migrateSettings(parsed.cwd ?? process.cwd());
  if (migration.migratedPaths.length > 0) {
    writeStderr("[!] Warning: Your configuration was migrated safely to the ANNG v2 settings schema.\n");
    for (const migratedPath of migration.migratedPaths) {
      writeStderr(`[!] Migrated: ${migratedPath}\n`);
    }
  }

  if (parsed.daemonWorker && parsed.prompt) {
    if (parsed.daemonManifestPath) {
      markDaemonWorkerStarted(parsed.daemonManifestPath);
    }
    try {
      await runOneShot({
        ...parsed,
        mode: "yolo",
      });
    } finally {
      if (parsed.daemonManifestPath) {
        finalizeDaemonManifest(parsed.daemonManifestPath, process.exitCode === 0 ? "completed" : "failed");
      }
    }
    return;
  }

  if (parsed.command === "config") {
    process.stdout.write(`${readConfigSummary(parsed.cwd ?? process.cwd())}\n`);
    return;
  }

  if (parsed.command === "doctor") {
    await runDoctorCommand({
      cwd: parsed.cwd ?? process.cwd(),
      keys: parsed.doctorKeys,
      outputMode: parsed.outputMode,
    });
    return;
  }

  if (parsed.command === "mcp") {
    await runMcpCommand({
      cwd: parsed.cwd ?? process.cwd(),
      action: parsed.mcpAction,
      outputMode: parsed.outputMode,
    });
    return;
  }

  if (parsed.command === "daemon") {
    await runDaemonCommand({
      cwd: parsed.cwd ?? process.cwd(),
      action: parsed.daemonAction,
      taskId: parsed.daemonTaskId,
      outputMode: parsed.outputMode,
    });
    return;
  }

  if (parsed.command === "sessions") {
    await runSessionsCommand({
      cwd: parsed.cwd ?? process.cwd(),
      action: parsed.sessionsAction,
      sessionId: parsed.sessionId,
      outputMode: parsed.outputMode,
    });
    return;
  }

  if (parsed.anngTeam && parsed.prompt) {
    await runTeam(parsed);
    return;
  }

  if (parsed.daemon && parsed.prompt) {
    await runDaemonRuntime({
      prompt: parsed.prompt,
      cwd: parsed.cwd ?? process.cwd(),
      provider: parsed.provider,
      model: parsed.model,
      key: parsed.key,
      baseUrl: parsed.baseUrl,
      timeoutSeconds: parsed.timeoutSeconds,
    });
    return;
  }

  if (!parsed.prompt || parsed.interactive || parsed.stay) {
    await launchInteractive(parsed);
    return;
  }

  await runOneShot(parsed);
}

function finalizeDaemonManifest(manifestPath: string, status: "completed" | "failed"): void {
  try {
    const current = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as DaemonManifest;
    current.status = status;
    current.finishedAt = new Date().toISOString();
    if (status === "failed") {
      current.failureReason = "Daemon worker exited with a non-zero status.";
    } else {
      delete current.failureReason;
    }
    fs.writeFileSync(manifestPath, `${JSON.stringify(current, null, 2)}\n`, "utf8");

    if (current.queueName && current.queueTaskId) {
      const { markTaskDoneById } = require("./common/task-queue");
      markTaskDoneById(current.cwd, current.queueName, current.queueTaskId);
    }
  } catch {
    // Ignore daemon manifest finalization failures so the worker result is not hidden.
  }
}

function markDaemonWorkerStarted(manifestPath: string): void {
  try {
    const current = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    current.workerStartedAt = new Date().toISOString();
    current.status = "running";
    fs.writeFileSync(manifestPath, `${JSON.stringify(current, null, 2)}\n`, "utf8");
  } catch {
    // Ignore startup marker failures.
  }
}
