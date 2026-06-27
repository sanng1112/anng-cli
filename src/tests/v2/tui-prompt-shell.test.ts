import { describe, expect, it, vi } from "vitest";
import { createPromptController } from "../../tui/controllers/prompt-controller";

describe("createPromptController", () => {
  it("tracks busy, status, and answer across one prompt", async () => {
    const submitPrompt = vi.fn(async () => ({
      sessionId: "session-1",
      text: "done",
      status: "completed",
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      failReason: null,
    }));

    const controller = createPromptController({ submitPrompt });

    const run = controller.submit("fix tests");
    expect(controller.getState().busy).toBe(true);
    await run;
    expect(controller.getState().busy).toBe(false);
    expect(controller.getState().answer).toBe("done");
    expect(controller.getState().status).toBe("completed");
  });
});
