import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ResultAggregator } from "../../team/result-aggregator";
import type { TeamTaskResult } from "../../team/types";

describe("ResultAggregator", () => {
  const aggregator = new ResultAggregator();

  it("gộp kết quả từ nhiều tasks", () => {
    const results: Record<string, TeamTaskResult> = {
      t1: {
        ok: true,
        summary: "Built API",
        artifacts: [{ type: "file", path: "src/api.ts", content: "" }],
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        durationMs: 1000,
        workerSessionId: "s1",
      },
      t2: {
        ok: true,
        summary: "Built UI",
        artifacts: [{ type: "file", path: "src/App.tsx", content: "" }],
        usage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 },
        durationMs: 2000,
        workerSessionId: "s2",
      },
    };

    const result = aggregator.aggregate(results);
    assert.ok(result.summary.includes("Built API"));
    assert.ok(result.summary.includes("Built UI"));
    assert.equal(result.allArtifacts.length, 2);
    assert.equal(result.conflicts.length, 0);
  });

  it("phát hiện file conflict", () => {
    const results: Record<string, TeamTaskResult> = {
      t1: {
        ok: true,
        summary: "Edit auth",
        artifacts: [{ type: "file", path: "src/auth.ts", content: "" }],
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        durationMs: 0,
        workerSessionId: "s1",
      },
      t2: {
        ok: true,
        summary: "Edit auth too",
        artifacts: [{ type: "file", path: "src/auth.ts", content: "" }],
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        durationMs: 0,
        workerSessionId: "s2",
      },
    };

    const result = aggregator.aggregate(results);
    assert.equal(result.conflicts.length, 1);
    assert.ok(result.conflicts[0].includes("src/auth.ts"));
  });

  it("bỏ qua failed tasks", () => {
    const results: Record<string, TeamTaskResult> = {
      t1: {
        ok: false,
        summary: "Failed",
        artifacts: [],
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        durationMs: 0,
        workerSessionId: "s1",
        error: "err",
      },
    };

    const result = aggregator.aggregate(results);
    assert.equal(result.allArtifacts.length, 0);
    assert.ok(result.summary.includes("no tasks completed"));
  });
});
