import { randomUUID } from "crypto";
import { readJsonFile, writeJsonFileAtomicSync } from "./json-store";
import { ensureProjectStorageDir, getProjectStoragePaths } from "./project-storage";

export type GoalStatus = "active" | "completed" | "cancelled";

export type GoalEntry = {
  id: string;
  text: string;
  status: GoalStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

type GoalStore = {
  version: 1;
  activeGoalId: string | null;
  entries: GoalEntry[];
};

export type GoalSnapshot = {
  activeGoal: GoalEntry | null;
  recentGoals: GoalEntry[];
  totalGoals: number;
  completedGoals: number;
  storagePath: string;
};

const EMPTY_GOAL_STORE: GoalStore = {
  version: 1,
  activeGoalId: null,
  entries: [],
};

export function getGoalSnapshot(projectRoot: string): GoalSnapshot {
  const store = loadGoalStore(projectRoot);
  const activeGoal = store.entries.find((entry) => entry.id === store.activeGoalId) ?? null;
  return {
    activeGoal,
    recentGoals: [...store.entries].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, 8),
    totalGoals: store.entries.length,
    completedGoals: store.entries.filter((entry) => entry.status === "completed").length,
    storagePath: getProjectStoragePaths(projectRoot).goalsPath,
  };
}

export function setActiveGoal(projectRoot: string, text: string): GoalEntry {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Goal text cannot be empty.");
  }

  const now = new Date().toISOString();
  const store = loadGoalStore(projectRoot);

  if (store.activeGoalId) {
    const current = store.entries.find((entry) => entry.id === store.activeGoalId);
    if (current && current.status === "active") {
      current.status = "cancelled";
      current.updatedAt = now;
    }
  }

  const goal: GoalEntry = {
    id: randomUUID(),
    text: trimmed,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  store.entries.unshift(goal);
  store.activeGoalId = goal.id;
  saveGoalStore(projectRoot, store);
  return goal;
}

export function completeActiveGoal(projectRoot: string): GoalEntry | null {
  const store = loadGoalStore(projectRoot);
  if (!store.activeGoalId) {
    return null;
  }
  const goal = store.entries.find((entry) => entry.id === store.activeGoalId && entry.status === "active");
  if (!goal) {
    store.activeGoalId = null;
    saveGoalStore(projectRoot, store);
    return null;
  }
  const now = new Date().toISOString();
  goal.status = "completed";
  goal.updatedAt = now;
  goal.completedAt = now;
  store.activeGoalId = null;
  saveGoalStore(projectRoot, store);
  return goal;
}

export function clearActiveGoal(projectRoot: string): GoalEntry | null {
  const store = loadGoalStore(projectRoot);
  if (!store.activeGoalId) {
    return null;
  }
  const goal = store.entries.find((entry) => entry.id === store.activeGoalId && entry.status === "active");
  if (!goal) {
    store.activeGoalId = null;
    saveGoalStore(projectRoot, store);
    return null;
  }
  goal.status = "cancelled";
  goal.updatedAt = new Date().toISOString();
  store.activeGoalId = null;
  saveGoalStore(projectRoot, store);
  return goal;
}

export function loadGoalStore(projectRoot: string): GoalStore {
  const { goalsPath } = getProjectStoragePaths(projectRoot);
  const parsed = readJsonFile<GoalStore>(goalsPath, EMPTY_GOAL_STORE);
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.entries)) {
    return { ...EMPTY_GOAL_STORE };
  }
  return {
    version: 1,
    activeGoalId: typeof parsed.activeGoalId === "string" ? parsed.activeGoalId : null,
    entries: parsed.entries
      .filter((entry) => entry && typeof entry.text === "string" && typeof entry.id === "string")
      .map((entry) => ({
        id: entry.id,
        text: entry.text,
        status: entry.status === "completed" || entry.status === "cancelled" ? entry.status : "active",
        createdAt: entry.createdAt || new Date(0).toISOString(),
        updatedAt: entry.updatedAt || entry.createdAt || new Date(0).toISOString(),
        completedAt: entry.completedAt,
      })),
  };
}

export function saveGoalStore(projectRoot: string, store: GoalStore): void {
  ensureProjectStorageDir(projectRoot);
  const { goalsPath } = getProjectStoragePaths(projectRoot);
  const normalized: GoalStore = {
    version: 1,
    activeGoalId: store.activeGoalId,
    entries: store.entries.slice(0, 50),
  };
  writeJsonFileAtomicSync(goalsPath, normalized);
}
