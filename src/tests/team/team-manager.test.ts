import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { TeamManager } from "../../team/team-manager";

describe("TeamManager", () => {
  let manager: TeamManager;

  beforeEach(() => {
    manager = new TeamManager();
  });

  afterEach(() => {
    for (const team of manager.listActiveTeams()) {
      manager.disposeTeam(team.teamId);
    }
  });

  it("tạo team với config hợp lệ", () => {
    const team = manager.createTeam({
      name: "test-team",
      coordinator: { name: "coord", role: "coordinator" },
      workers: [{ name: "w1", role: "worker" }],
    });
    assert.equal(team.definition.name, "test-team");
    assert.equal(team.workers.size, 1);
    assert.ok(team.workers.has("w1"));
    assert.equal(team.status, "initializing");
  });

  it("tự sinh teamId nếu không cung cấp", () => {
    const team = manager.createTeam({
      name: "test",
      coordinator: { name: "c", role: "coordinator" },
      workers: [{ name: "w", role: "worker" }],
    });
    assert.ok(team.teamId.length > 0);
    assert.ok(team.definition.id === team.teamId);
  });

  it("từ chối config không hợp lệ", () => {
    assert.throws(() => {
      manager.createTeam({
        name: "bad",
        coordinator: { name: "c", role: "coordinator" },
        workers: [],
      });
    });
  });

  it("cập nhật trạng thái team", () => {
    const team = manager.createTeam({
      name: "t",
      coordinator: { name: "c", role: "coordinator" },
      workers: [{ name: "w", role: "worker" }],
    });
    manager.updateTeamStatus(team.teamId, "waiting_for_decomposition");
    const updated = manager.getTeam(team.teamId);
    assert.equal(updated?.status, "waiting_for_decomposition");
  });

  it("cập nhật worker state", () => {
    const team = manager.createTeam({
      name: "t",
      coordinator: { name: "c", role: "coordinator" },
      workers: [{ name: "w", role: "worker" }],
    });
    manager.updateWorker(team.teamId, "w", {
      status: "busy",
      currentTaskId: "task-1",
    });
    const worker = manager.getTeam(team.teamId)?.workers.get("w");
    assert.equal(worker?.status, "busy");
    assert.equal(worker?.currentTaskId, "task-1");
  });

  it("dispose xóa team khỏi memory", () => {
    const team = manager.createTeam({
      name: "t",
      coordinator: { name: "c", role: "coordinator" },
      workers: [{ name: "w", role: "worker" }],
    });
    manager.disposeTeam(team.teamId);
    assert.equal(manager.getTeam(team.teamId), undefined);
  });

  it("listActiveTeams trả về tất cả teams", () => {
    manager.createTeam({
      name: "t1",
      coordinator: { name: "c", role: "coordinator" },
      workers: [{ name: "w", role: "worker" }],
    });
    manager.createTeam({
      name: "t2",
      coordinator: { name: "c2", role: "coordinator" },
      workers: [{ name: "w2", role: "worker" }],
    });
    assert.equal(manager.listActiveTeams().length, 2);
  });

  it("interrupt đặt trạng thái interrupted và abort", () => {
    const team = manager.createTeam({
      name: "t",
      coordinator: { name: "c", role: "coordinator" },
      workers: [{ name: "w", role: "worker" }],
    });
    manager.interruptTeam(team.teamId);
    assert.equal(team.status, "interrupted");
    assert.equal(team.abortController.signal.aborted, true);
  });
});
