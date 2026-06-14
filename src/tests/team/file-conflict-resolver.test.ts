import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FileConflictResolver } from "../../team/file-conflict-resolver";
import type { TeamTask } from "../../team/types";

describe("FileConflictResolver", () => {
  it("last-write-wins: cho phép override lock", () => {
    const resolver = new FileConflictResolver("last-write-wins");
    assert.equal(resolver.acquireLock("src/file.ts", "task-1"), true);
    assert.equal(resolver.acquireLock("src/file.ts", "task-2"), true);
  });

  it("fail-on-conflict: từ chối override lock", () => {
    const resolver = new FileConflictResolver("fail-on-conflict");
    assert.equal(resolver.acquireLock("src/file.ts", "task-1"), true);
    assert.equal(resolver.acquireLock("src/file.ts", "task-2"), false);
  });

  it("releaseLock giải phóng lock", () => {
    const resolver = new FileConflictResolver("fail-on-conflict");
    resolver.acquireLock("src/file.ts", "task-1");
    resolver.releaseLock("src/file.ts", "task-1");
    assert.equal(resolver.acquireLock("src/file.ts", "task-2"), true);
  });

  it("detectConflicts phát hiện file trùng giữa tasks", () => {
    const resolver = new FileConflictResolver();
    const tasks: TeamTask[] = [
      {
        id: "t1",
        description: "Task 1",
        status: "pending",
        dependencies: [],
        relatedFiles: ["src/a.ts", "src/b.ts"],
        createdAt: new Date().toISOString(),
      },
      {
        id: "t2",
        description: "Task 2",
        status: "pending",
        dependencies: [],
        relatedFiles: ["src/b.ts", "src/c.ts"],
        createdAt: new Date().toISOString(),
      },
    ];
    const conflicts = resolver.detectConflicts(tasks);
    assert.equal(conflicts.length, 1);
    assert.ok(conflicts[0].includes("src/b.ts"));
  });

  it("detectConflicts không có conflict khi files khác nhau", () => {
    const resolver = new FileConflictResolver();
    const tasks: TeamTask[] = [
      {
        id: "t1",
        description: "",
        status: "pending",
        dependencies: [],
        relatedFiles: ["src/a.ts"],
        createdAt: "",
      },
      {
        id: "t2",
        description: "",
        status: "pending",
        dependencies: [],
        relatedFiles: ["src/b.ts"],
        createdAt: "",
      },
    ];
    assert.equal(resolver.detectConflicts(tasks).length, 0);
  });

  it("detectConflicts không có conflict khi không có relatedFiles", () => {
    const resolver = new FileConflictResolver();
    const tasks: TeamTask[] = [
      { id: "t1", description: "", status: "pending", dependencies: [], createdAt: "" },
      { id: "t2", description: "", status: "pending", dependencies: [], createdAt: "" },
    ];
    assert.equal(resolver.detectConflicts(tasks).length, 0);
  });

  it("merge-attempt strategy cho phép override lock", () => {
    const resolver = new FileConflictResolver("merge-attempt");
    assert.equal(resolver.acquireLock("src/file.ts", "task-1"), true);
    assert.equal(resolver.acquireLock("src/file.ts", "task-2"), true);
  });
});
