import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { resolveAnngPaths } from "../core/config/home";
import { resolveMergedAnngSettings } from "../core/config/settings-loader";
import { getProjectMemoryPaths } from "../core/memory/project-memory";

export type DoctorKeyRow = {
  maskedKey: string;
  requests: number;
  failures: number;
  status: string;
  waitSeconds: number;
};

export type DoctorStatus = {
  cwd: string;
  nodeVersion: string;
  tmuxInstalled: boolean;
  settingsPath: string;
  settingsExists: boolean;
  memoryDir: string;
  mcpServerNames: string[];
  keyRows: DoctorKeyRow[];
};

export function formatDoctorKeyTable(rows: DoctorKeyRow[]): string {
  if (rows.length === 0) {
    return "No key rotation data recorded yet.";
  }

  const header = ["Key", "Requests", "Failures", "Status", "Wait(s)"].join("\t");
  const lines = rows.map((row) =>
    [row.maskedKey, String(row.requests), String(row.failures), row.status, String(row.waitSeconds)].join("\t")
  );
  return [header, ...lines].join("\n");
}

export async function runDoctorCommand(
  input: {
    cwd: string;
    keys?: boolean;
    outputMode?: "text" | "json";
  },
  deps: {
    writeStdout?: (text: string) => void;
  } = {}
): Promise<void> {
  const writeStdout = deps.writeStdout ?? ((text: string) => process.stdout.write(text));
  const status = getDoctorStatus(input.cwd);

  if (input.outputMode === "json") {
    writeStdout(`${JSON.stringify(status)}\n`);
    return;
  }

  const lines = [
    `ANNG doctor`,
    `cwd: ${status.cwd}`,
    `node: ${status.nodeVersion}`,
    `tmux: ${status.tmuxInstalled ? "installed" : "missing"}`,
    `settings: ${status.settingsPath}${status.settingsExists ? "" : " (missing)"}`,
    `memory: ${status.memoryDir}`,
    `mcp servers: ${status.mcpServerNames.length > 0 ? status.mcpServerNames.join(", ") : "none"}`,
  ];

  if (input.keys) {
    lines.push("");
    lines.push(formatDoctorKeyTable(status.keyRows));
  }

  writeStdout(`${lines.join("\n")}\n`);
}

export function getDoctorStatus(cwd: string): DoctorStatus {
  const paths = resolveAnngPaths(cwd);
  const settings = resolveMergedAnngSettings(cwd);
  const memory = getProjectMemoryPaths(cwd);

  return {
    cwd,
    nodeVersion: process.version,
    tmuxInstalled: checkTmuxInstalled(),
    settingsPath: paths.settings,
    settingsExists: fs.existsSync(paths.settings),
    memoryDir: memory.memoryDir,
    mcpServerNames: settings.mcpServers ? Object.keys(settings.mcpServers) : [],
    keyRows: readKeyRotationRows(cwd),
  };
}

function checkTmuxInstalled(): boolean {
  const result = spawnSync("tmux", ["-V"], { encoding: "utf8" });
  return result.status === 0;
}

function readKeyRotationRows(cwd: string): DoctorKeyRow[] {
  const logPath = path.join(resolveAnngPaths(cwd).logsDir, "key_rotation.log");
  if (!fs.existsSync(logPath)) {
    return [];
  }

  const stats = new Map<string, DoctorKeyRow>();
  const lines = fs.readFileSync(logPath, "utf8").split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as Partial<DoctorKeyRow>;
      if (!parsed.maskedKey || typeof parsed.maskedKey !== "string") {
        continue;
      }
      stats.set(parsed.maskedKey, {
        maskedKey: parsed.maskedKey,
        requests: typeof parsed.requests === "number" ? parsed.requests : 0,
        failures: typeof parsed.failures === "number" ? parsed.failures : 0,
        status: typeof parsed.status === "string" ? parsed.status : "unknown",
        waitSeconds: typeof parsed.waitSeconds === "number" ? parsed.waitSeconds : 0,
      });
    } catch {
      // Ignore non-JSON legacy lines.
    }
  }
  return [...stats.values()].sort((left, right) => left.maskedKey.localeCompare(right.maskedKey));
}
