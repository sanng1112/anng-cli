import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureStartupSettingsMigration } from "../../core/config/settings-startup";
import { migrateLegacySettings, migrateLegacySettingsFile } from "../../core/config/settings-migrate";

const tempDirs: string[] = [];
const previousAnngHome = process.env.ANNG_HOME;

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "anng-settings-migrate-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  process.env.ANNG_HOME = previousAnngHome;
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("migrateLegacySettings", () => {
  it("backs up the old file name and emits the v2 schema", async () => {
    const result = await migrateLegacySettings({
      legacyJson: { provider: "gemini", thinkingEnabled: true },
    });

    expect(result.backupFileName).toBe("settings.legacy.bak");
    expect(result.nextConfig.anng_extensions).toBeDefined();
    expect(result.nextConfig.provider).toBe("gemini");
  });

  it("creates a backup and rewrites the target file in place", async () => {
    const dir = createTempDir();
    const settingsPath = path.join(dir, "settings.json");
    fs.writeFileSync(settingsPath, JSON.stringify({ provider: "gemini", model: "gemini-2.5-pro" }), "utf8");

    const result = await migrateLegacySettingsFile(settingsPath);

    expect(result.migrated).toBe(true);
    expect(fs.existsSync(path.join(dir, "settings.legacy.bak"))).toBe(true);

    const migrated = JSON.parse(fs.readFileSync(settingsPath, "utf8")) as {
      provider?: string;
      anng_extensions?: unknown;
    };

    expect(migrated.provider).toBe("gemini");
    expect(migrated.anng_extensions).toBeDefined();
  });

  it("does not rewrite files already in v2 schema", async () => {
    const dir = createTempDir();
    const settingsPath = path.join(dir, "settings.json");
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({ schemaVersion: 2, anng_extensions: { raw_reasoning: {} } }),
      "utf8"
    );

    const result = await migrateLegacySettingsFile(settingsPath);

    expect(result.migrated).toBe(false);
    expect(fs.existsSync(path.join(dir, "settings.legacy.bak"))).toBe(false);
  });

  it("migrates user and project settings during startup scan", async () => {
    const homeDir = createTempDir();
    const workspace = createTempDir();
    process.env.ANNG_HOME = homeDir;
    fs.mkdirSync(path.join(workspace, ".anng"), { recursive: true });

    const userSettingsPath = path.join(homeDir, "settings.json");
    const projectSettingsPath = path.join(workspace, ".anng", "settings.json");
    fs.writeFileSync(userSettingsPath, JSON.stringify({ provider: "gemini" }), "utf8");
    fs.writeFileSync(projectSettingsPath, JSON.stringify({ model: "deepseek-v4-pro" }), "utf8");

    const result = await ensureStartupSettingsMigration(workspace);

    expect(result.migratedPaths.sort()).toEqual([projectSettingsPath, userSettingsPath].sort());
    expect(fs.existsSync(path.join(homeDir, "settings.legacy.bak"))).toBe(true);
    expect(fs.existsSync(path.join(workspace, ".anng", "settings.legacy.bak"))).toBe(true);
  });
});
