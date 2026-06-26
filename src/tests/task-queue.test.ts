import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { addNamedQueue, addTask, getNextPendingQueueTask, markTaskDoneById } from "../common/task-queue";

function createTempProjectRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "anng-task-queue-"));
}

describe("getNextPendingQueueTask", () => {
  it("prefers the current queue when it still has pending work", () => {
    const projectRoot = createTempProjectRoot();
    addNamedQueue(projectRoot, "bugs");
    const mainTask = addTask(projectRoot, "main", "main task");
    const bugTask = addTask(projectRoot, "bugs", "bug task");

    const nextTask = getNextPendingQueueTask(projectRoot, "bugs");

    fs.rmSync(projectRoot, { recursive: true, force: true });

    assert.ok(mainTask);
    assert.ok(bugTask);
    assert.equal(nextTask?.queueName, "bugs");
    assert.equal(nextTask?.task.id, bugTask.id);
    assert.equal(nextTask?.task.text, bugTask.text);
    assert.equal(nextTask?.task.done, false);
  });

  it("falls back to the next queue when the preferred queue is empty", () => {
    const projectRoot = createTempProjectRoot();
    addNamedQueue(projectRoot, "bugs");
    const mainTask = addTask(projectRoot, "main", "main task");
    const bugTask = addTask(projectRoot, "bugs", "bug task");
    assert.ok(bugTask);
    markTaskDoneById(projectRoot, "bugs", bugTask.id);

    const nextTask = getNextPendingQueueTask(projectRoot, "bugs");

    fs.rmSync(projectRoot, { recursive: true, force: true });

    assert.ok(mainTask);
    assert.equal(nextTask?.queueName, "main");
    assert.equal(nextTask?.task.id, mainTask.id);
    assert.equal(nextTask?.task.text, mainTask.text);
    assert.equal(nextTask?.task.done, false);
  });
});
