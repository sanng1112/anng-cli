import { describe, expect, it, vi } from "vitest";
import { runSessionsCommand } from "../../commands/sessions";
import { parseCliArgs } from "../../commands/program";

describe("sessions command", () => {
  it("parses sessions list/show subcommands", () => {
    const listParsed = parseCliArgs(["sessions", "--json"]);
    const showParsed = parseCliArgs(["sessions", "show", "session-1"]);

    expect(listParsed.command).toBe("sessions");
    expect(listParsed.outputMode).toBe("json");
    expect(showParsed.command).toBe("sessions");
    expect(showParsed.sessionsAction).toBe("show");
    expect(showParsed.sessionId).toBe("session-1");
  });

  it("prints stored sessions in text mode", async () => {
    const writeStdout = vi.fn<(text: string) => void>();

    await runSessionsCommand(
      { cwd: process.cwd(), outputMode: "text" },
      {
        readSessions: () => [
          {
            id: "session-1",
            summary: "Refactor daemon shell",
            status: "completed",
            updateTime: "2026-01-01T00:00:00.000Z",
          },
        ],
        writeStdout,
      }
    );

    expect(writeStdout).toHaveBeenCalledWith(expect.stringContaining("ANNG sessions"));
    expect(writeStdout).toHaveBeenCalledWith(expect.stringContaining("session-1"));
    expect(writeStdout).toHaveBeenCalledWith(expect.stringContaining("Refactor daemon shell"));
  });

  it("prints session detail and recent messages in show mode", async () => {
    const writeStdout = vi.fn<(text: string) => void>();

    await runSessionsCommand(
      { cwd: process.cwd(), action: "show", sessionId: "session-1", outputMode: "text" },
      {
        readSessions: () => [],
        readSessionDetail: () => ({
          id: "session-1",
          summary: "Refactor daemon shell",
          status: "completed",
          updateTime: "2026-01-01T00:00:00.000Z",
          assistantReply: "Done",
          failReason: null,
          createTime: "2026-01-01T00:00:00.000Z",
        }),
        readSessionMessages: () => [
          { role: "user", content: "refactor daemon" },
          { role: "assistant", content: "done" },
        ],
        writeStdout,
      }
    );

    expect(writeStdout).toHaveBeenCalledWith(expect.stringContaining("ANNG session"));
    expect(writeStdout).toHaveBeenCalledWith(expect.stringContaining("[user] refactor daemon"));
    expect(writeStdout).toHaveBeenCalledWith(expect.stringContaining("[assistant] done"));
  });

  it("prints session detail with recent messages", async () => {
    const writeStdout = vi.fn<(text: string) => void>();

    await runSessionsCommand(
      { cwd: process.cwd(), action: "show", sessionId: "session-1", outputMode: "text" },
      {
        readSessionDetail: () => ({
          id: "session-1",
          summary: "Fix parser",
          status: "completed",
          updateTime: "2026-01-01T00:00:00.000Z",
          assistantReply: "done",
          failReason: null,
        }),
        readSessionMessages: () => [
          { role: "user", content: "fix parser" },
          { role: "assistant", content: "done" },
        ],
        writeStdout,
      }
    );

    expect(writeStdout).toHaveBeenCalledWith(expect.stringContaining("[assistant] done"));
  });
});
