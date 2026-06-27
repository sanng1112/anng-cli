import { describe, expect, it, vi } from "vitest";
import { createAgentAdapter } from "../../runtime/agent-adapter";
import { runAgent } from "../../runtime/run-agent";

describe("createAgentAdapter", () => {
  it("returns a runtime that exposes submitPrompt", async () => {
    const runtime = await createAgentAdapter({
      cwd: process.cwd(),
      createSessionManager: () => ({
        handleUserPrompt: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        interruptActiveSession: vi.fn(),
        dispose: vi.fn(),
        getActiveSessionId: vi.fn(() => "session-1"),
        getSession: vi.fn(() => ({
          id: "session-1",
          assistantReply: "done",
          status: "completed",
          failReason: null,
          usage: {
            prompt_tokens: 1,
            completion_tokens: 2,
            total_tokens: 3,
          },
        })),
      }),
    });

    expect(typeof runtime.submitPrompt).toBe("function");
  });

  it("runs one-shot mode through the adapter", async () => {
    const events: string[] = [];
    const adapterFactory = vi.fn(async () => ({
      submitPrompt: vi.fn(async () => ({
        sessionId: "session-1",
        text: "done",
        status: "completed",
        usage: {
          inputTokens: 1,
          outputTokens: 2,
          totalTokens: 3,
        },
        failReason: null,
      })),
      abort: vi.fn(),
      dispose: vi.fn(),
    }));

    await runAgent(
      {
        prompt: "fix tests",
        cwd: process.cwd(),
        outputMode: "json",
        model: "test-model",
      },
      {
        createAdapter: adapterFactory,
        writeStdout: (text) => events.push(text),
      }
    );

    expect(adapterFactory).toHaveBeenCalled();
    const parsed = events.map((line) => JSON.parse(line));
    expect(parsed[0]).toMatchObject({
      type: "run_started",
      prompt: "fix tests",
      model: "test-model",
    });
    expect(parsed[1]).toMatchObject({
      type: "run_result",
      sessionId: "session-1",
      status: "completed",
    });
  });

  it("aborts the adapter when a timeout is reached", async () => {
    vi.useFakeTimers();
    const events: string[] = [];
    const abort = vi.fn();
    const dispose = vi.fn();
    const adapterFactory = vi.fn(async () => ({
      submitPrompt: vi.fn(
        async () =>
          await new Promise<never>(() => {
            // never resolves
          })
      ),
      abort,
      dispose,
    }));

    const runPromise = runAgent(
      {
        prompt: "fix tests",
        cwd: process.cwd(),
        outputMode: "json",
        timeoutSeconds: 1,
      },
      {
        createAdapter: adapterFactory,
        writeStdout: (text) => events.push(text),
      }
    );

    await vi.advanceTimersByTimeAsync(1000);
    await runPromise;

    expect(abort).toHaveBeenCalledTimes(1);
    const parsed = events.map((line) => JSON.parse(line));
    expect(parsed[0]).toMatchObject({
      type: "run_started",
      prompt: "fix tests",
    });
    expect(parsed[1]).toMatchObject({
      type: "run_aborted",
      reason: "timeout",
    });
    expect(dispose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("outputs NDJSON containing start and finish events in json mode", async () => {
    const stdout: string[] = [];
    const adapterFactory = vi.fn(async () => ({
      submitPrompt: vi.fn(async () => ({
        sessionId: "session-1",
        text: "done",
        status: "completed",
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
        failReason: null,
      })),
      abort: vi.fn(),
      dispose: vi.fn(),
    }));

    await runAgent(
      {
        prompt: "fix tests",
        cwd: process.cwd(),
        outputMode: "json",
      },
      {
        createAdapter: adapterFactory,
        writeStdout: (text) => stdout.push(text),
      }
    );

    expect(stdout[0]).toContain('"type":"run_started"');
    expect(stdout[1]).toContain('"type":"run_result"');
  });
});
