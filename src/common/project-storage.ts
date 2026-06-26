import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { writeJsonFileAtomicSync } from "./json-store";
import { getProjectCode } from "../session/types";

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

export function getProjectStoragePaths(projectRoot: string): ProjectStoragePaths {
  const projectCode = getProjectCode(projectRoot);
  const projectDir = path.join(os.homedir(), ".anng", "projects", projectCode);
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
