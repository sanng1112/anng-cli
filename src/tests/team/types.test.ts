import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AgentConfigSchema, TeamDefinitionSchema } from "../../team/types";

describe("AgentConfigSchema", () => {
  it("chấp nhận config hợp lệ", () => {
    const result = AgentConfigSchema.safeParse({
      name: "worker-1",
      role: "worker",
    });
    assert.equal(result.success, true);
  });

  it("từ chối role không hợp lệ", () => {
    const result = AgentConfigSchema.safeParse({
      name: "w1",
      role: "invalid-role",
    });
    assert.equal(result.success, false);
  });

  it("từ chối name rỗng", () => {
    const result = AgentConfigSchema.safeParse({
      name: "",
      role: "worker",
    });
    assert.equal(result.success, false);
  });

  it("từ chối name quá dài (>64)", () => {
    const result = AgentConfigSchema.safeParse({
      name: "x".repeat(65),
      role: "coordinator",
    });
    assert.equal(result.success, false);
  });

  it("chấp nhận các optional fields", () => {
    const result = AgentConfigSchema.safeParse({
      name: "w1",
      role: "worker",
      description: "does stuff",
      model: "test-model",
      skills: ["code-review"],
      systemPrompt: "be helpful",
      maxTurns: 50,
      taskTimeoutMs: 300000,
    });
    assert.equal(result.success, true);
  });

  it("từ chối maxTurns không phải số dương", () => {
    const result = AgentConfigSchema.safeParse({
      name: "w1",
      role: "worker",
      maxTurns: 0,
    });
    assert.equal(result.success, false);
  });

  it("từ chối taskTimeoutMs không phải số dương", () => {
    const result = AgentConfigSchema.safeParse({
      name: "w1",
      role: "worker",
      taskTimeoutMs: -1,
    });
    assert.equal(result.success, false);
  });
});

describe("TeamDefinitionSchema", () => {
  it("chấp nhận definition hợp lệ", () => {
    const result = TeamDefinitionSchema.safeParse({
      name: "my-team",
      coordinator: { name: "coord", role: "coordinator" },
      workers: [{ name: "w1", role: "worker" }],
    });
    assert.equal(result.success, true);
  });

  it("từ chối workers rỗng", () => {
    const result = TeamDefinitionSchema.safeParse({
      name: "my-team",
      coordinator: { name: "coord", role: "coordinator" },
      workers: [],
    });
    assert.equal(result.success, false);
  });

  it("từ chối quá 16 workers", () => {
    const workers = Array.from({ length: 17 }, (_, i) => ({
      name: `w${i}`,
      role: "worker" as const,
    }));
    const result = TeamDefinitionSchema.safeParse({
      name: "big-team",
      coordinator: { name: "coord", role: "coordinator" },
      workers,
    });
    assert.equal(result.success, false);
  });

  it("chấp nhận tất cả optional fields", () => {
    const result = TeamDefinitionSchema.safeParse({
      name: "full-team",
      coordinator: { name: "coord", role: "coordinator" },
      workers: [{ name: "w1", role: "worker" }],
      id: "custom-id",
      maxParallelWorkers: 4,
      strategy: "round-robin",
      mode: "tmux",
      allowFileSystemAccess: false,
      maxRetriesPerTask: 2,
    });
    assert.equal(result.success, true);
  });

  it("từ chối strategy không hợp lệ", () => {
    const result = TeamDefinitionSchema.safeParse({
      name: "bad-strategy",
      coordinator: { name: "coord", role: "coordinator" },
      workers: [{ name: "w1", role: "worker" }],
      strategy: "invalid",
    });
    assert.equal(result.success, false);
  });

  it("từ chối mode không hợp lệ", () => {
    const result = TeamDefinitionSchema.safeParse({
      name: "bad-mode",
      coordinator: { name: "coord", role: "coordinator" },
      workers: [{ name: "w1", role: "worker" }],
      mode: "distributed",
    });
    assert.equal(result.success, false);
  });

  it("từ chối name quá dài (>128)", () => {
    const result = TeamDefinitionSchema.safeParse({
      name: "x".repeat(129),
      coordinator: { name: "c", role: "coordinator" },
      workers: [{ name: "w", role: "worker" }],
    });
    assert.equal(result.success, false);
  });

  it("từ chối maxRetriesPerTask vượt giới hạn", () => {
    const result = TeamDefinitionSchema.safeParse({
      name: "bad-retry",
      coordinator: { name: "c", role: "coordinator" },
      workers: [{ name: "w", role: "worker" }],
      maxRetriesPerTask: 10,
    });
    assert.equal(result.success, false);
  });

  it("cho phép 16 workers chính xác", () => {
    const workers = Array.from({ length: 16 }, (_, i) => ({
      name: `w${i}`,
      role: "worker" as const,
    }));
    const result = TeamDefinitionSchema.safeParse({
      name: "max-team",
      coordinator: { name: "c", role: "coordinator" },
      workers,
    });
    assert.equal(result.success, true);
  });
});
