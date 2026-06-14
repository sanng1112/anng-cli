import type { CreateOpenAIClient } from "../tools/executor";
import type { TeamTask } from "./types";
import * as crypto from "crypto";

export type DecompositionOptions = {
  createOpenAIClient: CreateOpenAIClient;
  maxSubTasks?: number;
  signal?: AbortSignal;
};

const DECOMPOSITION_PROMPT = `You are a task decomposition specialist. Given a complex software engineering task, break it down into smaller, independent sub-tasks that can be executed in parallel by AI coding agents.

Rules:
1. Each sub-task should be completable by a single agent in < 10 tool calls.
2. Order sub-tasks by dependency. A sub-task that depends on another's output must list it in "dependsOn".
3. Maximize parallelization — only create dependencies when truly necessary.
4. Assign each sub-task a priority (1-5, 5=highest).
5. Estimate which files each sub-task will touch (to detect conflicts).

Respond in JSON format:
{
  "subTasks": [
    {
      "title": "short title",
      "description": "detailed instructions for the agent",
      "dependsOn": [],
      "priority": 3,
      "estimatedFiles": ["src/file1.ts", "src/file2.ts"]
    }
  ]
}`;

export class TaskDecomposer {
  async decompose(taskDescription: string, options: DecompositionOptions): Promise<TeamTask[]> {
    const { client, model } = options.createOpenAIClient();
    if (!client) {
      return [this.createSingleTask(taskDescription)];
    }

    try {
      const response = await client.chat.completions.create({
        model,
        temperature: 0.1,
        messages: [
          { role: "system", content: DECOMPOSITION_PROMPT },
          { role: "user", content: `Decompose this task:\n${taskDescription}` },
        ],
        response_format: { type: "json_object" },
      });

      const rawContent = (response.choices?.[0]?.message as { content?: string } | undefined)?.content;
      const content = typeof rawContent === "string" ? rawContent : "";
      if (!content) {
        return [this.createSingleTask(taskDescription)];
      }

      const parsed = JSON.parse(content);
      if (!parsed.subTasks || !Array.isArray(parsed.subTasks) || parsed.subTasks.length === 0) {
        return [this.createSingleTask(taskDescription)];
      }

      const maxSubTasks = options.maxSubTasks ?? 8;
      const subTasks = parsed.subTasks.slice(0, maxSubTasks);

      const tasks: TeamTask[] = [];
      const taskIdMap = new Map<number, string>();

      for (let i = 0; i < subTasks.length; i++) {
        const sub = subTasks[i];
        const taskId = crypto.randomUUID();
        taskIdMap.set(i, taskId);

        tasks.push({
          id: taskId,
          description: sub.description || sub.title || `Sub-task ${i + 1}`,
          status: "pending",
          dependencies: [],
          priority: typeof sub.priority === "number" ? sub.priority : 0,
          relatedFiles: Array.isArray(sub.estimatedFiles) ? sub.estimatedFiles : [],
          createdAt: new Date().toISOString(),
        });
      }

      for (let i = 0; i < subTasks.length; i++) {
        const sub = subTasks[i];
        if (Array.isArray(sub.dependsOn)) {
          for (const depIndex of sub.dependsOn) {
            if (typeof depIndex === "number") {
              const depId = taskIdMap.get(depIndex);
              if (depId) {
                tasks[i].dependencies.push(depId);
              }
            }
          }
        }
      }

      return tasks;
    } catch {
      return [this.createSingleTask(taskDescription)];
    }
  }

  private createSingleTask(description: string): TeamTask {
    return {
      id: crypto.randomUUID(),
      description,
      status: "pending",
      dependencies: [],
      priority: 1,
      createdAt: new Date().toISOString(),
    };
  }
}
