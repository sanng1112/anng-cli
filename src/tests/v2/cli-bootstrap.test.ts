import { describe, expect, it, vi } from "vitest";
import { runCli } from "../../main";

describe("runCli", () => {
  it("launches interactive mode when no prompt is provided", async () => {
    const launchInteractive = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const runOneShot = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    await runCli([], { launchInteractive, runOneShot });

    expect(launchInteractive).toHaveBeenCalledTimes(1);
    expect(runOneShot).not.toHaveBeenCalled();
  });

  it("runs one-shot mode when a prompt is provided", async () => {
    const launchInteractive = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const runOneShot = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    await runCli(["fix tests"], { launchInteractive, runOneShot });

    expect(runOneShot).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "fix tests",
      })
    );
    expect(launchInteractive).not.toHaveBeenCalled();
  });

  it("translates the legacy prompt flag before dispatch", async () => {
    const launchInteractive = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const runOneShot = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const writeStderr = vi.fn<(text: string) => void>();

    await runCli(["-p", "legacy prompt"], { launchInteractive, runOneShot, writeStderr });

    expect(runOneShot).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "legacy prompt",
      })
    );
    expect(writeStderr).toHaveBeenCalledWith(expect.stringContaining("'-p' is deprecated"));
  });

  it("passes through the parsed cwd override", async () => {
    const launchInteractive = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const runOneShot = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    await runCli(["--cwd", "/tmp/project", "fix tests"], { launchInteractive, runOneShot });

    expect(runOneShot).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: "/tmp/project",
      })
    );
  });

  it("passes provider/model/key/base-url overrides into one-shot execution", async () => {
    const launchInteractive = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const runOneShot = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    await runCli(
      [
        "-P",
        "deepseek",
        "-m",
        "deepseek-v4-pro",
        "-k",
        "sk-test",
        "--base-url",
        "https://example.test/v1",
        "fix tests",
      ],
      { launchInteractive, runOneShot }
    );

    expect(runOneShot).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "deepseek",
        model: "deepseek-v4-pro",
        key: "sk-test",
        baseUrl: "https://example.test/v1",
      })
    );
  });

  it("passes timeout into one-shot execution", async () => {
    const launchInteractive = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const runOneShot = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    await runCli(["--timeout", "15", "fix tests"], { launchInteractive, runOneShot });

    expect(runOneShot).toHaveBeenCalledWith(
      expect.objectContaining({
        timeoutSeconds: 15,
      })
    );
  });

  it("prints help without launching runtime paths", async () => {
    const launchInteractive = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const runOneShot = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const migrateSettings = vi.fn<(cwd: string) => Promise<{ migratedPaths: string[] }>>().mockResolvedValue({
      migratedPaths: [],
    });
    const writeStdout = vi.fn<(text: string) => void>();

    await runCli(["--help"], { launchInteractive, runOneShot, migrateSettings, writeStdout });

    expect(writeStdout).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
    expect(migrateSettings).not.toHaveBeenCalled();
    expect(launchInteractive).not.toHaveBeenCalled();
    expect(runOneShot).not.toHaveBeenCalled();
  });

  it("prints version without launching runtime paths", async () => {
    const launchInteractive = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const runOneShot = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const migrateSettings = vi.fn<(cwd: string) => Promise<{ migratedPaths: string[] }>>().mockResolvedValue({
      migratedPaths: [],
    });
    const writeStdout = vi.fn<(text: string) => void>();

    await runCli(["--version"], { launchInteractive, runOneShot, migrateSettings, writeStdout });

    expect(writeStdout).toHaveBeenCalledWith(expect.stringMatching(/^\d+\.\d+\.\d+\n$/));
    expect(migrateSettings).not.toHaveBeenCalled();
    expect(launchInteractive).not.toHaveBeenCalled();
    expect(runOneShot).not.toHaveBeenCalled();
  });

  it("rejects unknown flags instead of ignoring them", async () => {
    await expect(runCli(["--mystery-flag"], {})).rejects.toThrow("Unknown flags: --mystery-flag");
  });

  it("prints a migration warning when startup settings are upgraded", async () => {
    const launchInteractive = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const runOneShot = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const writeStderr = vi.fn<(text: string) => void>();
    const migrateSettings = vi.fn<(cwd: string) => Promise<{ migratedPaths: string[] }>>().mockResolvedValue({
      migratedPaths: ["/tmp/.anng/settings.json"],
    });

    await runCli([], { launchInteractive, runOneShot, writeStderr, migrateSettings });

    expect(migrateSettings).toHaveBeenCalled();
    expect(writeStderr).toHaveBeenCalledWith(
      expect.stringContaining("Your configuration was migrated safely to the ANNG v2 settings schema.")
    );
    expect(writeStderr).toHaveBeenCalledWith(expect.stringContaining("/tmp/.anng/settings.json"));
  });

  it("dispatches team mode when --team flag is specified", async () => {
    const launchInteractive = vi.fn().mockResolvedValue(undefined);
    const runOneShot = vi.fn().mockResolvedValue(undefined);
    const runTeam = vi.fn().mockResolvedValue(undefined);

    await runCli(["--team", "refactor tests"], { launchInteractive, runOneShot, runTeam });

    expect(runTeam).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "refactor tests",
      })
    );
    expect(launchInteractive).not.toHaveBeenCalled();
    expect(runOneShot).not.toHaveBeenCalled();
  });
});
