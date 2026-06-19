/**
 * Workspace Metadata Builder
 *
 * Builds a structured JSON metadata block describing the workspace environment.
 * Injected into the system prompt at the {{CLINE_METADATA}} placeholder.
 *
 * Inspired by Cline's buildWorkspaceMetadata().
 */

import * as os from "os";
import { execSync, execFileSync } from "child_process";
import { findGitBashPath, resolveShellPath } from "../common/shell-utils";

export interface MetadataOptions {
  /** Override extension root for testing */
  extensionRoot?: string;
}

export interface WorkspaceMetadata {
  rootPath: string;
  cwd: string;
  homedir: string;
  shell: string;
  git?: {
    branch: string;
    hasChanges: boolean;
    topLevel: string;
  };
  tools: Record<string, boolean>;
  runtimes: Record<string, string>;
  date: string;
  platform: string;
}

export function buildWorkspaceMetadata(projectRoot: string, _options?: MetadataOptions): WorkspaceMetadata {
  const git = resolveGitInfo(projectRoot);

  return {
    rootPath: projectRoot,
    cwd: projectRoot,
    homedir: os.homedir(),
    shell: resolveShellPath(),
    git: git ?? undefined,
    tools: {
      rg: checkToolInstalled("rg"),
      jq: checkToolInstalled("jq"),
    },
    runtimes: getRuntimeVersions(),
    date: new Date().toLocaleDateString(),
    platform: process.platform,
  };
}

export function formatMetadataBlock(metadata: WorkspaceMetadata): string {
  return ["# Workspace Information", "", "```json", JSON.stringify(metadata, null, 2), "```"].join("\n");
}

export function getCurrentDateString(): string {
  return new Date().toLocaleDateString();
}

// =============================================================================
// Internal helpers
// =============================================================================

function resolveGitInfo(projectRoot: string): { branch: string; hasChanges: boolean; topLevel: string } | null {
  try {
    const gitDir = findGitDir(projectRoot);
    if (!gitDir) return null;

    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: "pipe",
      timeout: 1000,
    }).trim();

    const hasChanges =
      execSync("git status --porcelain", {
        cwd: projectRoot,
        encoding: "utf8",
        stdio: "pipe",
        timeout: 2000,
      }).trim().length > 0;

    const topLevel = execSync("git rev-parse --show-toplevel", {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: "pipe",
      timeout: 1000,
    }).trim();

    return { branch, hasChanges, topLevel };
  } catch {
    return null;
  }
}

function findGitDir(dir: string): string | null {
  try {
    const result = execSync("git rev-parse --git-dir", {
      cwd: dir,
      encoding: "utf8",
      stdio: "pipe",
      timeout: 1000,
    }).trim();
    return result || null;
  } catch {
    return null;
  }
}

function checkToolInstalled(tool: string): boolean {
  try {
    if (process.platform === "win32") {
      const bashPath = findGitBashPath();
      execSync(`command -v ${tool}`, {
        encoding: "utf8",
        stdio: "ignore",
        shell: bashPath,
        timeout: 1000,
      });
    } else {
      execSync(`command -v ${tool}`, {
        encoding: "utf8",
        stdio: "ignore",
        timeout: 1000,
      });
    }
    return true;
  } catch {
    return false;
  }
}

function getRuntimeVersions(): Record<string, string> {
  const versions: Record<string, string> = {};
  const pythonVer = getCommandVersion("python3", ["--version"]);
  const nodeVer = getCommandVersion("node", ["--version"]);
  if (pythonVer) versions.python3 = pythonVer.replace(/^Python\s+/i, "");
  if (nodeVer) versions.node = nodeVer;
  return versions;
}

function getCommandVersion(command: string, args: string[]): string | null {
  try {
    const cmd = [command, ...args].map((a) => `'${a.replace(/'/g, "'\"'\"'")}'`).join(" ");
    if (process.platform === "win32") {
      return execFileSync(findGitBashPath(), ["-lc", `${cmd} 2>&1`], {
        encoding: "utf8",
        windowsHide: true,
      }).trim();
    }
    return execSync(`${cmd} 2>&1`, { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}
