import * as fs from "node:fs";
import * as path from "node:path";
import { resolveAnngPaths } from "../config/home";

export type DaemonManifest = {
  id: string;
  prompt: string;
  cwd: string;
  createdAt: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  pid?: number;
  logPath?: string;
  workerStartedAt?: string;
  finishedAt?: string;
  failureReason?: string;
  heartbeatAt?: string;
  cancelRequestedAt?: string;
  queueName?: string;
  queueTaskId?: string;
};

export function createDaemonManifest(input: { prompt: string; cwd: string }): DaemonManifest {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    prompt: input.prompt,
    cwd: input.cwd,
    createdAt: new Date().toISOString(),
    status: "queued",
  };
}

export function cancelTask(
  cwd: string,
  taskId: string,
  deps: {
    readDir?: (dirPath: string) => string[];
    readFile?: (filePath: string) => string;
    writeFile?: (filePath: string, content: string) => void;
  } = {}
): boolean {
  const manifest = findDaemonManifest(cwd, taskId, deps);
  if (!manifest) return false;

  const daemonDir = path.join(resolveAnngPaths(cwd).home, "daemon");
  const manifestPath = path.join(daemonDir, `${taskId}.json`);
  const writeFile =
    deps.writeFile ?? ((filePath: string, content: string) => fs.writeFileSync(filePath, content, "utf8"));

  const updated: DaemonManifest = {
    ...manifest,
    status: "cancelled",
    cancelRequestedAt: new Date().toISOString(),
  };

  try {
    writeFile(manifestPath, JSON.stringify(updated, null, 2));
    return true;
  } catch {
    return false;
  }
}

export function listDaemonManifests(
  cwd: string,
  deps: {
    readDir?: (dirPath: string) => string[];
    readFile?: (filePath: string) => string;
  } = {}
): DaemonManifest[] {
  const daemonDir = path.join(resolveAnngPaths(cwd).home, "daemon");
  const readDir = deps.readDir ?? ((dirPath: string) => fs.readdirSync(dirPath));
  const readFile = deps.readFile ?? ((filePath: string) => fs.readFileSync(filePath, "utf8"));

  try {
    const entries = readDir(daemonDir)
      .filter((entry) => entry.endsWith(".json"))
      .sort()
      .reverse();

    const manifests: DaemonManifest[] = [];
    for (const entry of entries) {
      try {
        manifests.push(JSON.parse(readFile(path.join(daemonDir, entry))) as DaemonManifest);
      } catch {
        // Ignore malformed daemon manifests when listing tasks.
      }
    }
    return manifests;
  } catch {
    return [];
  }
}

export function findDaemonManifest(
  cwd: string,
  taskId: string,
  deps: {
    readDir?: (dirPath: string) => string[];
    readFile?: (filePath: string) => string;
  } = {}
): DaemonManifest | null {
  return listDaemonManifests(cwd, deps).find((manifest) => manifest.id === taskId) ?? null;
}

export function readDaemonLog(
  cwd: string,
  manifest: DaemonManifest,
  deps: {
    readFile?: (filePath: string) => string;
  } = {}
): string | null {
  const readFile = deps.readFile ?? ((filePath: string) => fs.readFileSync(filePath, "utf8"));
  const logPath = manifest.logPath ?? path.join(resolveAnngPaths(cwd).home, "daemon", "logs", `${manifest.id}.log`);

  try {
    return readFile(logPath);
  } catch {
    return null;
  }
}
