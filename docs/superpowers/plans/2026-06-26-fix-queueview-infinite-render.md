# Fix QueueView Infinite Render Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the React "Maximum update depth exceeded" error occurring in QueueView by stabilizing dependencies and preventing infinite state update loop.

**Architecture:** Stabilize hook references inside `QueueView.tsx` by using `activeQueue?.name` as the dependency instead of the `activeQueue` object reference. Since `activeQueue` is reconstructed on every render/update, using it as a dependency in hooks like `useCallback` (for `refreshTasks`) or `useEffect` triggers cascading re-renders.

**Tech Stack:** React 19, TypeScript

---

### Task 1: Stabilize Dependencies in QueueView

**Files:**
- Modify: `src/ui/views/QueueView.tsx:83-98`

- [ ] **Step 1: Modify the useEffect that fetches tasks and the refreshTasks callback**

Change:
```typescript
  const refreshTasks = useCallback(() => {
    if (activeQueue) setTasks(loadQueue(projectRoot, activeQueue.name));
  }, [projectRoot, activeQueue]);
```
To:
```typescript
  const activeQueueName = activeQueue?.name;
  const refreshTasks = useCallback(() => {
    if (activeQueueName) setTasks(loadQueue(projectRoot, activeQueueName));
  }, [projectRoot, activeQueueName]);
```

And change:
```typescript
  useEffect(() => {
    if (activeQueue) setTasks(loadQueue(projectRoot, activeQueue.name));
  }, [projectRoot, activeQueue]);
```
To:
```typescript
  useEffect(() => {
    if (activeQueueName) setTasks(loadQueue(projectRoot, activeQueueName));
  }, [projectRoot, activeQueueName]);
```

- [ ] **Step 2: Run type check, linting, and formatting checks**

Run: `npm run check`
Expected: Success with no type errors or lints on modified files.

- [ ] **Step 3: Build the CLI to ensure complete sanity check**

Run: `npm run build`
Expected: Build succeeds without errors.

- [ ] **Step 4: Commit the changes**

Run: `git commit -am "fix(ui): resolve infinite render loop in QueueView"`
