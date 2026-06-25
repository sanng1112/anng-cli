// Stub: Team orchestration module (to be restored)
import type { TeamResult } from "./types";

export class TeamOrchestrator {
  constructor(_opts: Record<string, unknown>) {}
  async executeTask(_task: string, _config: Record<string, unknown>): Promise<TeamResult> {
    return { executiveSummary: "Team mode unavailable (stub)" };
  }
  interrupt(): void {}
}
