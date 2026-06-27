import * as fs from "fs";
import * as path from "path";
import { writeJsonFileAtomicSync } from "./json-store";
import { getProjectCode } from "../session/types";
import { resolveAnngHome } from "../core/config/home";
import type { SessionMessage, SessionStatus } from "../session/types";

export type ProjectStoragePaths = {
  projectCode: string;
  projectDir: string;
  sessionsIndexPath: string;
  goalsPath: string;
  localDbPath: string;
  memoryDir: string;
  queueDir: string;
  agentsMdPath: string;
};

export type ProjectStorageSnapshot = ProjectStoragePaths & {
  projectDirExists: boolean;
  sessionsIndexExists: boolean;
  goalsExists: boolean;
  localDbExists: boolean;
  queueDirExists: boolean;
  queueFileCount: number;
};

export type RecentSessionSummary = {
  id: string;
  summary: string | null;
  status: SessionStatus | "unknown";
  updateTime: string;
};

export type StoredSessionDetail = RecentSessionSummary & {
  assistantReply?: string | null;
  failReason?: string | null;
  createTime?: string;
};

export function getProjectStoragePaths(projectRoot: string): ProjectStoragePaths {
  const projectCode = getProjectCode(projectRoot);
  const projectDir = path.join(resolveAnngHome(), "projects", projectCode);
  const memoryDir = path.join(projectRoot, ".anng", "memory");
  return {
    projectCode,
    projectDir,
    sessionsIndexPath: path.join(projectDir, "sessions-index.json"),
    goalsPath: path.join(projectDir, "goals.json"),
    localDbPath: path.join(projectDir, "local-db.json"),
    memoryDir,
    queueDir: path.join(memoryDir, "queues"),
    agentsMdPath: path.join(projectRoot, ".anng", "AGENTS.md"),
  };
}

export function ensureProjectStorageDir(projectRoot: string): string {
  const { projectDir } = getProjectStoragePaths(projectRoot);
  fs.mkdirSync(projectDir, { recursive: true });
  writeProjectStorageManifest(projectRoot);
  return projectDir;
}

export function writeProjectStorageManifest(projectRoot: string): void {
  const paths = getProjectStoragePaths(projectRoot);
  fs.mkdirSync(paths.projectDir, { recursive: true });
  writeJsonFileAtomicSync(paths.localDbPath, {
    version: 1,
    projectCode: paths.projectCode,
    projectRoot,
    updatedAt: new Date().toISOString(),
    stores: {
      sessionsIndex: path.basename(paths.sessionsIndexPath),
      goals: path.basename(paths.goalsPath),
      queueDir: path.relative(projectRoot, paths.queueDir) || ".anng/memory/queues",
    },
  });
}

export function getProjectStorageSnapshot(projectRoot: string): ProjectStorageSnapshot {
  const paths = getProjectStoragePaths(projectRoot);
  const queueDirExists = fs.existsSync(paths.queueDir);
  const queueFileCount = queueDirExists
    ? fs.readdirSync(paths.queueDir).filter((file) => file.endsWith(".md")).length
    : 0;
  return {
    ...paths,
    projectDirExists: fs.existsSync(paths.projectDir),
    sessionsIndexExists: fs.existsSync(paths.sessionsIndexPath),
    goalsExists: fs.existsSync(paths.goalsPath),
    localDbExists: fs.existsSync(paths.localDbPath),
    queueDirExists,
    queueFileCount,
  };
}

export function readRecentSessions(projectRoot: string, limit = 5): RecentSessionSummary[] {
  return readStoredSessions(projectRoot).slice(0, Math.max(1, limit));
}

export function readStoredSessions(projectRoot: string): RecentSessionSummary[] {
  const { sessionsIndexPath } = getProjectStoragePaths(projectRoot);
  try {
    if (!fs.existsSync(sessionsIndexPath)) {
      return [];
    }
    const raw = fs.readFileSync(sessionsIndexPath, "utf8");
    const parsed = JSON.parse(raw) as { entries?: unknown[] };
    if (!Array.isArray(parsed.entries)) {
      return [];
    }

    return parsed.entries
      .flatMap((entry) => {
        if (!entry || typeof entry !== "object") {
          return [];
        }
        const candidate = entry as Record<string, unknown>;
        if (typeof candidate.id !== "string" || typeof candidate.updateTime !== "string") {
          return [];
        }
        return [
          {
            id: candidate.id,
            summary: typeof candidate.summary === "string" ? candidate.summary : null,
            status:
              typeof candidate.status === "string" ? (candidate.status as RecentSessionSummary["status"]) : "unknown",
            updateTime: candidate.updateTime,
          },
        ];
      })
      .sort((left, right) => right.updateTime.localeCompare(left.updateTime));
  } catch {
    return [];
  }
}

export function readStoredSessionDetail(projectRoot: string, sessionId: string): StoredSessionDetail | null {
  const { sessionsIndexPath } = getProjectStoragePaths(projectRoot);
  try {
    if (!fs.existsSync(sessionsIndexPath)) {
      return null;
    }
    const parsed = JSON.parse(fs.readFileSync(sessionsIndexPath, "utf8")) as { entries?: unknown[] };
    if (!Array.isArray(parsed.entries)) {
      return null;
    }
    for (const entry of parsed.entries) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const candidate = entry as Record<string, unknown>;
      if (candidate.id !== sessionId || typeof candidate.updateTime !== "string") {
        continue;
      }
      return {
        id: sessionId,
        summary: typeof candidate.summary === "string" ? candidate.summary : null,
        status: typeof candidate.status === "string" ? (candidate.status as StoredSessionDetail["status"]) : "unknown",
        updateTime: candidate.updateTime,
        assistantReply: typeof candidate.assistantReply === "string" ? candidate.assistantReply : null,
        failReason: typeof candidate.failReason === "string" ? candidate.failReason : null,
        createTime: typeof candidate.createTime === "string" ? candidate.createTime : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function readStoredSessionMessages(projectRoot: string, sessionId: string, limit = 10): SessionMessage[] {
  const { projectDir } = getProjectStoragePaths(projectRoot);
  const messagePath = path.join(projectDir, `${sessionId}.jsonl`);
  try {
    if (!fs.existsSync(messagePath)) {
      return [];
    }
    return fs
      .readFileSync(messagePath, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as SessionMessage];
        } catch {
          return [];
        }
      })
      .slice(-Math.max(1, limit));
  } catch {
    return [];
  }
}

export function readRecentSessionTranscript(projectRoot: string, limit = 4): SessionMessage[] {
  const recent = readRecentSessions(projectRoot, 1)[0];
  if (!recent) {
    return [];
  }
  return readStoredSessionMessages(projectRoot, recent.id, limit);
}
