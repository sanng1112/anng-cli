import type { TeamArtifact, TeamTaskResult } from "./types";

export class ResultAggregator {
  aggregate(taskResults: Record<string, TeamTaskResult>): {
    summary: string;
    allArtifacts: TeamArtifact[];
    conflicts: string[];
  } {
    const allArtifacts: TeamArtifact[] = [];
    const conflicts: string[] = [];
    const fileLastModifiedBy = new Map<string, string>();

    const summaries: string[] = [];
    let index = 1;

    for (const [taskId, result] of Object.entries(taskResults)) {
      if (!result.ok) continue;

      summaries.push(`${index}. ${result.summary}`);
      index++;

      for (const artifact of result.artifacts) {
        if (artifact.type === "file" && artifact.path) {
          const existing = fileLastModifiedBy.get(artifact.path);
          if (existing && existing !== taskId) {
            conflicts.push(`File conflict: "${artifact.path}" modified by both ${existing} and ${taskId}`);
          }
          fileLastModifiedBy.set(artifact.path, taskId);
        }
        allArtifacts.push(artifact);
      }
    }

    return {
      summary: summaries.join("\n") || "(no tasks completed successfully)",
      allArtifacts,
      conflicts,
    };
  }
}
