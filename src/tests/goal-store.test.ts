import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { clearActiveGoal, completeActiveGoal, getGoalSnapshot, setActiveGoal } from "../common/goal-store";

function withTempHome<T>(run: (projectRoot: string) => T): T {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "anng-goals-home-"));
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "anng-goals-project-"));
  const originalHome = process.env.HOME;
  const originalUserProfile = process.env.USERPROFILE;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  try {
    return run(projectRoot);
  } finally {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    if (originalUserProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = originalUserProfile;
    }
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
}

describe("goal-store", () => {
  it("stores and exposes the active goal", () =>
    withTempHome((projectRoot) => {
      const goal = setActiveGoal(projectRoot, "Refactor session persistence");
      const snapshot = getGoalSnapshot(projectRoot);

      assert.equal(snapshot.activeGoal?.id, goal.id);
      assert.equal(snapshot.activeGoal?.text, "Refactor session persistence");
      assert.equal(snapshot.totalGoals, 1);
      assert.equal(fs.existsSync(snapshot.storagePath), true);
    }));

  it("completes the active goal and clears it from active state", () =>
    withTempHome((projectRoot) => {
      setActiveGoal(projectRoot, "Ship /status");
      const completed = completeActiveGoal(projectRoot);
      const snapshot = getGoalSnapshot(projectRoot);

      assert.equal(completed?.status, "completed");
      assert.equal(snapshot.activeGoal, null);
      assert.equal(snapshot.completedGoals, 1);
    }));

  it("cancels the previous active goal when a new goal is set", () =>
    withTempHome((projectRoot) => {
      const first = setActiveGoal(projectRoot, "Old goal");
      const second = setActiveGoal(projectRoot, "New active goal");
      const snapshot = getGoalSnapshot(projectRoot);
      const cancelled = snapshot.recentGoals.find((entry) => entry.id === first.id);

      assert.equal(snapshot.activeGoal?.id, second.id);
      assert.equal(cancelled?.status, "cancelled");
    }));

  it("clears the active goal without marking it completed", () =>
    withTempHome((projectRoot) => {
      setActiveGoal(projectRoot, "Temporary goal");
      const cleared = clearActiveGoal(projectRoot);
      const snapshot = getGoalSnapshot(projectRoot);

      assert.equal(cleared?.status, "cancelled");
      assert.equal(snapshot.activeGoal, null);
      assert.equal(snapshot.completedGoals, 0);
    }));
});
