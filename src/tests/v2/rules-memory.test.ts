import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildRuleBundle } from "../../core/rules/discovery";
import {
  getProjectMemoryPaths,
  readProjectMemory,
  writeProjectMemory,
  buildProjectContextHints,
} from "../../core/memory/project-memory";

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

describe("buildRuleBundle", () => {
  it("orders rules as global then project then skills", async () => {
    const homeDir = createTempDir("anng-home-");
    const projectDir = createTempDir("anng-project-");
    process.env.ANNG_HOME = homeDir;

    fs.mkdirSync(path.join(homeDir, "skills", "global-skill"), { recursive: true });
    fs.writeFileSync(path.join(homeDir, "AGENTS.md"), "global rules", "utf8");
    fs.writeFileSync(path.join(homeDir, "skills", "global-skill", "SKILL.md"), "# global skill", "utf8");
    fs.writeFileSync(path.join(projectDir, ".clinerules"), "project rules", "utf8");

    const bundle = await buildRuleBundle({ cwd: projectDir });

    expect(bundle.order).toEqual(["global", "project", "skills"]);
    expect(bundle.content).toContain("global rules");
    expect(bundle.content).toContain("project rules");
    expect(bundle.content).toContain("# global skill");
  });
});

describe("project memory", () => {
  it("stores markdown memory in project-local .anng/memory", () => {
    const projectDir = createTempDir("anng-memory-");
    const paths = getProjectMemoryPaths(projectDir);

    writeProjectMemory(projectDir, "notes", "# hello");

    expect(paths.memoryDir.endsWith(path.join(".anng", "memory"))).toBe(true);
    expect(readProjectMemory(projectDir, "notes")).toBe("# hello");
  });

  it("prioritizes README, package.json, and language manifests in onboarding hints", () => {
    const hints = buildProjectContextHints(process.cwd());
    expect(Array.isArray(hints)).toBe(true);
  });
});
