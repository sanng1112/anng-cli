import { describe, expect, it, vi } from "vitest";
import { createSessionShell } from "../../tui/session-shell";

describe("createSessionShell", () => {
  it("submits a prompt and exposes active session output", async () => {
    const shell = createSessionShell({
      submitPrompt: vi.fn(async () => ({
        sessionId: "session-1",
        text: "done",
        status: "completed",
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
        failReason: null,
      })),
    });

    await shell.submit("fix tests");

    expect(shell.getState().activeSessionId).toBe("session-1");
    expect(shell.getState().answer).toBe("done");
    expect(shell.getState().status).toBe("completed");
  });

  it("reuses the active session for follow-up prompts", async () => {
    const calls: string[] = [];
    const shell = createSessionShell({
      submitPrompt: async (prompt) => {
        calls.push(prompt);
        return {
          sessionId: "session-1",
          text: prompt === "first" ? "one" : "two",
          status: "completed",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          failReason: null,
        };
      },
    });

    await shell.submit("first");
    await shell.submit("second");

    expect(calls).toEqual(["first", "second"]);
    expect(shell.getState().activeSessionId).toBe("session-1");
  });
});
