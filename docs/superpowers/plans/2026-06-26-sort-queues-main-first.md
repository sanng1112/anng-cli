# Sort Queues Main First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure the primary queue `main` is always sorted first in the queues list, so that all default queue operations (like adding tasks from chat or auto-queueing when busy) target `main` instead of alphabetically first queues like `bugs`.

**Architecture:** Modify `listQueues` in `src/common/task-queue.ts` to sort the queues array before returning it, ensuring `main` is at index 0 and others are sorted alphabetically.

**Tech Stack:** Node.js, TypeScript

---

### Task 1: Sort Queues List in task-queue.ts

**Files:**
- Modify: `src/common/task-queue.ts:51-58`

- [ ] **Step 1: Update listQueues to sort the queue list**

In `src/common/task-queue.ts`, replace the return statement:
```typescript
    return queues.length > 0
      ? queues
      : DEFAULT_QUEUES.map((n) => ({
          name: n,
          label: n.charAt(0).toUpperCase() + n.slice(1),
          taskCount: 0,
          pendingCount: 0,
        }));
```
With:
```typescript
    if (queues.length > 0) {
      queues.sort((a, b) => {
        if (a.name === "main") return -1;
        if (b.name === "main") return 1;
        return a.name.localeCompare(b.name);
      });
      return queues;
    }
    return DEFAULT_QUEUES.map((n) => ({
      name: n,
      label: n.charAt(0).toUpperCase() + n.slice(1),
      taskCount: 0,
      pendingCount: 0,
    }));
```

- [ ] **Step 2: Run type check, linting, and formatting**

Run: `npm run check`
Expected: Success with no errors.

- [ ] **Step 3: Run the test suite**

Run: `npm run test`
Expected: All tests pass.

- [ ] **Step 4: Commit the changes**

Run: `git commit -am "fix(common): sort queues to keep main first"`
