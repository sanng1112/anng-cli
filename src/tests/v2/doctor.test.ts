import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendKeyRotationSnapshot } from "../../core/gemini/key-log";
import { readConfigSummary } from "../../commands/config";
import { formatDoctorKeyTable, getDoctorStatus, runDoctorCommand } from "../../commands/doctor";
import { parseCliArgs } from "../../commands/program";
import { vi } from "vitest";

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

describe("doctor command", () => {
  it("formats key statistics as a readable table", () => {
    const table = formatDoctorKeyTable([
      { maskedKey: "sk-***", requests: 10, failures: 1, status: "active", waitSeconds: 0 },
    ]);

    expect(table).toContain("sk-***");
    expect(table).toContain("10");
    expect(table).toContain("active");
  });

  it("parses doctor as a subcommand instead of prompt text", () => {
    const parsed = parseCliArgs(["doctor", "--keys"]);

    expect(parsed.command).toBe("doctor");
    expect(parsed.prompt).toBeUndefined();
    expect(parsed.doctorKeys).toBe(true);
  });

  it("reads JSON key rotation snapshots from the ANNG log", () => {
    const homeDir = createTempDir("anng-doctor-home-");
    process.env.ANNG_HOME = homeDir;

    appendKeyRotationSnapshot(
      {
        model: "gemini-2.5-pro",
        maskedKey: "AQ.A***1234",
        requests: 7,
        failures: 2,
        status: "rate_limited",
        waitSeconds: 60,
      },
      process.cwd()
    );

    const status = getDoctorStatus(process.cwd());

    expect(status.keyRows).toEqual([
      {
        maskedKey: "AQ.A***1234",
        requests: 7,
        failures: 2,
        status: "rate_limited",
        waitSeconds: 60,
      },
    ]);
  });

  it("prints key rotation statistics when --keys is used", async () => {
    const homeDir = createTempDir("anng-doctor-home-");
    process.env.ANNG_HOME = homeDir;

    appendKeyRotationSnapshot(
      {
        model: "gemini-2.5-pro",
        maskedKey: "AQ.A***5678",
        requests: 12,
        failures: 3,
        status: "active",
        waitSeconds: 0,
      },
      process.cwd()
    );

    const writeStdout = vi.fn<(text: string) => void>();
    await runDoctorCommand({ cwd: process.cwd(), keys: true, outputMode: "text" }, { writeStdout });

    expect(writeStdout).toHaveBeenCalledWith(expect.stringContaining("Requests"));
    expect(writeStdout).toHaveBeenCalledWith(expect.stringContaining("AQ.A***5678"));
  });
});

describe("config summary", () => {
  it("redacts API-like secrets", () => {
    const homeDir = createTempDir("anng-config-");
    process.env.ANNG_HOME = homeDir;
    fs.writeFileSync(
      path.join(homeDir, "settings.json"),
      JSON.stringify({
        apiKey: "sk-secret",
        env: {
          API_KEY: "sk-env-secret",
        },
        anng_extensions: {},
      }),
      "utf8"
    );

    const summary = readConfigSummary(process.cwd());

    expect(summary).not.toContain("sk-");
    expect(summary).toContain("__REDACTED__");
  });
});
