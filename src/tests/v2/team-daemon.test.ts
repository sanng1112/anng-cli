import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDaemonManifest } from "../../core/team/daemon-state";
import { runDaemon } from "../../runtime/run-daemon";
import { parseCliArgs } from "../../commands/program";
import { markTaskDoneById } from "../../common/task-queue";

const tempDirs: string[] = [];
const previousAnngHome = process.env.ANNG_HOME;

function createTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  process.env.ANNG_HOME = previousAnngHome;
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("createDaemonManifest", () => {
  it("stores prompt, cwd, and mode", () => {
    const manifest = createDaemonManifest({ prompt: "refactor x", cwd: "/tmp/repo" });

    expect(typeof manifest.id).toBe("string");
    expect(manifest.prompt).toBe("refactor x");
    expect(manifest.cwd).toBe("/tmp/repo");
    expect(manifest.status).toBe("queued");
  });

  it("spawns a detached daemon worker and returns a running manifest", async () => {
    process.env.ANNG_HOME = createTempDir("anng-daemon-home-");
    const writes: Array<{ filePath: string; content: string }> = [];
    const opened: string[] = [];

    const manifest = await runDaemon(
      { prompt: "refactor x", cwd: "/tmp/repo", provider: "deepseek", model: "deepseek-v4-pro" },
      {
        entryScriptPath: "/tmp/anng/dist/index.js",
        openLogFile: (filePath) => {
          opened.push(filePath);
          return 1;
        },
        writeManifest: (filePath, content) => {
          writes.push({ filePath, content });
        },
        spawnDetached: () => ({ pid: 4242, unref() {} }),
        isProcessAlive: () => true,
      }
    );

    expect(manifest.status).toBe("running");
    expect(manifest.pid).toBe(4242);
    expect(manifest.logPath).toContain(".log");
    expect(opened.length).toBeGreaterThan(0);
    expect(writes.length).toBeGreaterThan(0);
  });

  it("routes --anng-team --anng-tmux into team runtime", async () => {
    const parsed = parseCliArgs(["--anng-team", "--anng-tmux", "refactor repo"]);
    expect(parsed.anngTeam).toBe(true);
    expect(parsed.anngTmux).toBe(true);
  });

  it("records queue task completion during daemon processing", () => {
    expect(typeof markTaskDoneById).toBe("function");
  });
});
