import { describe, expect, it } from "vitest";
import { runDaemonCommand } from "../../commands/daemon";

describe("daemon cancel", () => {
  it("prints a cancel acknowledgement", async () => {
    let stdout = "";
    await runDaemonCommand(
      { cwd: process.cwd(), action: "cancel", taskId: "daemon-1", outputMode: "text" },
      {
        cancelTask: () => true,
        writeStdout: (text) => {
          stdout += text;
        },
      }
    );
    expect(stdout).toContain("Cancelled daemon task");
  });
});
