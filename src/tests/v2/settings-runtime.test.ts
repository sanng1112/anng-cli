import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getProjectSettingsPath, getUserSettingsPath, resolveCurrentSettings } from "../../settings";
import { readConfigSummary } from "../../commands/config";

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

describe("runtime settings bridge", () => {
  it("resolves user v2 settings from ANNG_HOME", () => {
    const homeDir = createTempDir("anng-v2-home-");
    const workspace = createTempDir("anng-v2-workspace-");
    process.env.ANNG_HOME = homeDir;

    fs.writeFileSync(
      getUserSettingsPath(),
      JSON.stringify(
        {
          schemaVersion: 2,
          provider: "gemini",
          model: "gemini-2.5-pro",
          baseURL: "https://custom-gemini.example/v1",
          apiKey: "user-key-123",
          thinkingEnabled: true,
          reasoningEffort: "max",
          maxTurns: 9,
          enabledSkills: { reviewer: true },
          permissions: { allow: ["read-in-cwd"], defaultMode: "askAll" },
          anng_extensions: {},
        },
        null,
        2
      ),
      "utf8"
    );

    const resolved = resolveCurrentSettings(workspace, {});

    expect(resolved.provider).toBe("gemini");
    expect(resolved.model).toBe("gemini-2.5-pro");
    expect(resolved.baseURL).toBe("https://custom-gemini.example/v1");
    expect(resolved.apiKey).toBe("user-key-123");
    expect(resolved.thinkingEnabled).toBe(true);
    expect(resolved.reasoningEffort).toBe("max");
    expect(resolved.maxTurns).toBe(9);
    expect(resolved.enabledSkills.reviewer).toBe(true);
    expect(resolved.permissions.allow).toContain("read-in-cwd");
  });

  it("applies project v2 settings over user v2 settings", () => {
    const homeDir = createTempDir("anng-v2-home-");
    const workspace = createTempDir("anng-v2-workspace-");
    process.env.ANNG_HOME = homeDir;
    fs.mkdirSync(path.join(workspace, ".anng"), { recursive: true });

    fs.writeFileSync(
      getUserSettingsPath(),
      JSON.stringify(
        {
          schemaVersion: 2,
          provider: "deepseek",
          model: "deepseek-v4-pro",
          apiKey: "user-key",
          enabledSkills: { inherited: false },
          anng_extensions: {},
        },
        null,
        2
      ),
      "utf8"
    );

    fs.writeFileSync(
      getProjectSettingsPath(workspace),
      JSON.stringify(
        {
          schemaVersion: 2,
          model: "deepseek-v4-flash",
          apiKey: "project-key",
          enabledSkills: { inherited: true, projectOnly: true },
          anng_extensions: {},
        },
        null,
        2
      ),
      "utf8"
    );

    const resolved = resolveCurrentSettings(workspace, {});

    expect(resolved.model).toBe("deepseek-v4-flash");
    expect(resolved.apiKey).toBe("project-key");
    expect(resolved.enabledSkills.inherited).toBe(true);
    expect(resolved.enabledSkills.projectOnly).toBe(true);
  });

  it("redacts keys and preserves merged provider config", () => {
    const homeDir = createTempDir("anng-v2-home-");
    process.env.ANNG_HOME = homeDir;

    fs.writeFileSync(
      getUserSettingsPath(),
      JSON.stringify({
        schemaVersion: 2,
        provider: "gemini",
        apiKey: "sk-user-secret",
        anng_extensions: {},
      }),
      "utf8"
    );

    const summary = readConfigSummary(process.cwd());
    expect(summary).toContain("__REDACTED__");
    expect(summary).not.toContain("sk-user-secret");
  });

  it("gives CLI/env override precedence over project and user settings", () => {
    const homeDir = createTempDir("anng-v2-home-");
    const workspace = createTempDir("anng-v2-workspace-");
    process.env.ANNG_HOME = homeDir;
    fs.mkdirSync(path.join(workspace, ".anng"), { recursive: true });

    // User settings
    fs.writeFileSync(
      getUserSettingsPath(),
      JSON.stringify({
        schemaVersion: 2,
        provider: "gemini",
        model: "gemini-2.5-pro",
        anng_extensions: {},
      }),
      "utf8"
    );

    // Project settings
    fs.writeFileSync(
      getProjectSettingsPath(workspace),
      JSON.stringify({
        schemaVersion: 2,
        provider: "openai",
        model: "gpt-4o",
        anng_extensions: {},
      }),
      "utf8"
    );

    // CLI overrides passed via processEnv
    const settings = resolveCurrentSettings(workspace, {
      ANNG_PROVIDER: "deepseek",
      ANNG_MODEL: "deepseek-v4-pro",
    });

    expect(settings.provider).toBe("deepseek");
    expect(settings.model).toBe("deepseek-v4-pro");
  });
});
