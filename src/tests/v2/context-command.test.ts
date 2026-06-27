import { describe, expect, it, vi } from "vitest";
import { runContextCommand } from "../../commands/context";

describe("context command", () => {
  it("prints rule sources and memory paths", async () => {
    let stdout = "";
    await runContextCommand(
      { cwd: process.cwd(), outputMode: "text" },
      {
        buildRuleSummary: () => ({
          sources: ["global", "project"],
          content: "rules",
        }),
        readMemorySummary: () => ({
          memoryDir: "/repo/.anng/memory",
          hints: ["README.md", "package.json"],
        }),
        writeStdout: (text) => {
          stdout += text;
        },
      }
    );
    expect(stdout).toContain("memoryDir");
    expect(stdout).toContain("global");
  });
});
