import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TaskDecomposer } from "../../team/task-decomposer";
import type { CreateOpenAIClient } from "../../tools/executor";

function makeClient(jsonResponse: unknown, shouldThrow = false): CreateOpenAIClient {
  return () => ({
    client: shouldThrow
      ? ({
          chat: {
            completions: {
              create: async () => {
                throw new Error("API error");
              },
            },
          },
        } as any)
      : ({
          chat: {
            completions: {
              create: async () => ({
                choices: [{ message: { content: JSON.stringify(jsonResponse) } }],
              }),
            },
          },
        } as any),
    model: "test-model",
    baseURL: "http://test",
    temperature: 0,
    thinkingEnabled: false,
    reasoningEffort: undefined,
    debugLogEnabled: false,
    telemetryEnabled: false,
    notify: undefined,
    webSearchTool: undefined,
    env: {},
    machineId: "test",
  });
}

describe("TaskDecomposer", () => {
  const decomposer = new TaskDecomposer();

  it("trả về single task khi không có API client", async () => {
    const noClient: CreateOpenAIClient = () => ({
      client: null,
      model: "",
      baseURL: "",
      temperature: undefined,
      thinkingEnabled: false,
      reasoningEffort: undefined,
      debugLogEnabled: false,
      telemetryEnabled: false,
      env: {},
      machineId: "",
    });
    const tasks = await decomposer.decompose("build a login page", {
      createOpenAIClient: noClient,
    });
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].status, "pending");
    assert.ok(tasks[0].id.length > 0);
  });

  it("trả về single task khi LLM trả về JSON rỗng", async () => {
    const tasks = await decomposer.decompose("do something", {
      createOpenAIClient: makeClient({ subTasks: [] }),
    });
    assert.equal(tasks.length, 1);
  });

  it("trả về single task khi LLM trả về JSON không có subTasks", async () => {
    const tasks = await decomposer.decompose("do something", {
      createOpenAIClient: makeClient({ other: true }),
    });
    assert.equal(tasks.length, 1);
  });

  it("phân rã thành nhiều sub-tasks từ JSON response", async () => {
    const tasks = await decomposer.decompose("build full-stack app", {
      createOpenAIClient: makeClient({
        subTasks: [
          {
            title: "Setup DB",
            description: "Create database schema",
            dependsOn: [],
            priority: 5,
            estimatedFiles: ["db/schema.sql"],
          },
          {
            title: "Build API",
            description: "Build REST endpoints",
            dependsOn: [0],
            priority: 4,
            estimatedFiles: ["src/api.ts"],
          },
          {
            title: "Build UI",
            description: "Build React frontend",
            dependsOn: [],
            priority: 3,
            estimatedFiles: ["src/App.tsx"],
          },
        ],
      }),
    });
    assert.equal(tasks.length, 3);
    const apiTask = tasks.find((t) => t.description.includes("REST"));
    assert.ok(apiTask);
    assert.ok(apiTask!.dependencies.length > 0, "API task should depend on Setup DB");
  });

  it("giới hạn số sub-tasks theo maxSubTasks", async () => {
    const manyTasks = Array.from({ length: 20 }, (_, i) => ({
      title: `Task ${i}`,
      description: `Do task ${i}`,
      dependsOn: [],
      priority: 1,
      estimatedFiles: [],
    }));
    const tasks = await decomposer.decompose("big task", {
      createOpenAIClient: makeClient({ subTasks: manyTasks }),
      maxSubTasks: 5,
    });
    assert.equal(tasks.length, 5);
  });

  it("fallback khi LLM throw error", async () => {
    const tasks = await decomposer.decompose("some task", {
      createOpenAIClient: makeClient({}, true),
    });
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].status, "pending");
  });

  it("mỗi sub-task có ID duy nhất", async () => {
    const tasks = await decomposer.decompose("build stuff", {
      createOpenAIClient: makeClient({
        subTasks: [
          { title: "A", description: "Do A", dependsOn: [], priority: 1, estimatedFiles: [] },
          { title: "B", description: "Do B", dependsOn: [], priority: 1, estimatedFiles: [] },
        ],
      }),
    });
    assert.equal(tasks.length, 2);
    assert.notEqual(tasks[0].id, tasks[1].id);
  });
});
