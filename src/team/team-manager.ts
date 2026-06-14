import type { TeamDefinition, TeamSession, WorkerState, TeamStatus, TeamTask } from "./types";
import { TeamDefinitionSchema } from "./types";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";

function getTeamStorageDir(): string {
  return path.join(os.homedir(), ".anng", "teams");
}

export class TeamManager {
  private activeTeams: Map<string, TeamSession> = new Map();

  createTeam(definition: TeamDefinition): TeamSession {
    const validated = TeamDefinitionSchema.parse(definition);
    const teamId = validated.id ?? crypto.randomUUID();
    const now = new Date().toISOString();

    const workers = new Map<string, WorkerState>();
    for (const workerConfig of validated.workers) {
      workers.set(workerConfig.name, {
        name: workerConfig.name,
        config: workerConfig,
        status: "idle",
        tasksCompleted: 0,
        tasksFailed: 0,
        totalUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      });
    }

    const session: TeamSession = {
      teamId,
      definition: { ...validated, id: teamId },
      status: "initializing",
      tasks: new Map(),
      workers,
      createdAt: now,
      updatedAt: now,
      abortController: new AbortController(),
    };

    this.activeTeams.set(teamId, session);
    this.persistTeam(session);
    return session;
  }

  getTeam(teamId: string): TeamSession | undefined {
    return this.activeTeams.get(teamId);
  }

  listActiveTeams(): TeamSession[] {
    return Array.from(this.activeTeams.values());
  }

  updateTeamStatus(teamId: string, status: TeamStatus, detail?: string): void {
    const team = this.activeTeams.get(teamId);
    if (!team) return;
    team.status = status;
    team.updatedAt = new Date().toISOString();
    team.onStatusChange?.(status, detail);
    this.persistTeam(team);
  }

  updateWorker(teamId: string, workerName: string, update: Partial<WorkerState>): void {
    const team = this.activeTeams.get(teamId);
    if (!team) return;
    const worker = team.workers.get(workerName);
    if (!worker) return;
    Object.assign(worker, update);
    team.updatedAt = new Date().toISOString();
    team.onWorkerUpdate?.(workerName, worker);
  }

  upsertTask(teamId: string, task: TeamTask): void {
    const team = this.activeTeams.get(teamId);
    if (!team) return;
    team.tasks.set(task.id, task);
    team.updatedAt = new Date().toISOString();
    team.onTaskUpdate?.(task.id, task);
  }

  disposeTeam(teamId: string): void {
    const team = this.activeTeams.get(teamId);
    if (!team) return;
    team.abortController.abort();
    this.activeTeams.delete(teamId);
    const filePath = this.getTeamFilePath(teamId);
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
      // ignore
    }
  }

  interruptTeam(teamId: string): void {
    const team = this.activeTeams.get(teamId);
    if (!team) return;
    team.abortController.abort();
    team.status = "interrupted";
    team.updatedAt = new Date().toISOString();
    this.persistTeam(team);
  }

  private getTeamFilePath(teamId: string): string {
    const dir = getTeamStorageDir();
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, `${teamId}.json`);
  }

  private persistTeam(team: TeamSession): void {
    try {
      const dir = getTeamStorageDir();
      fs.mkdirSync(dir, { recursive: true });
      const filePath = this.getTeamFilePath(team.teamId);
      const serialized = {
        ...team,
        tasks: Object.fromEntries(team.tasks),
        workers: Object.fromEntries(team.workers),
        abortController: undefined,
        onStatusChange: undefined,
        onTaskUpdate: undefined,
        onWorkerUpdate: undefined,
      };
      fs.writeFileSync(filePath, JSON.stringify(serialized, null, 2), "utf8");
    } catch {
      // Non-critical — persistence is best-effort
    }
  }
}
