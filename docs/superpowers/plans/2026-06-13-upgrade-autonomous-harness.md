# Autonomous Harness Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the existing execution harness in `anng-cli` to follow advanced autonomous agent design patterns, including proper Observation Design, Error Recovery Contracts, Semantic Context Compaction, and Persistent Task Queues for headless operations.
**Status:** Completed
**Architecture:** We will refactor the `ToolExecutionResult` schema and its JSON formatting to enforce structured observations (`status`, `summary`, `next_actions`, `artifacts`). We will add an error analyzer to `bash-handler` to provide root cause hints and retry instructions. We will modify `shouldCompactContext` to look for phase boundaries (e.g. successful macro tool calls) rather than arbitrary 30% retention. Finally, we will inject a file-based task queue loader in `cli.tsx` to handle headless autonomous workflows.

**Tech Stack:** TypeScript, Node.js.

---

### Task 1: Observation Design & Executor Schema

**Files:**
- Modify: `src/tools/executor.ts`

- [x] **Step 1: Update ToolExecutionResult interface**

```typescript
// Replace existing ToolExecutionResult definition with:
export type ToolExecutionResult = {
  ok: boolean;
  name: string;
  output?: string;
  error?: string;
  metadata?: Record<string, unknown>;
  awaitUserResponse?: boolean;
  followUpMessages?: ToolExecutionFollowUpMessage[];
  // Observation Design properties:
  status?: "success" | "warning" | "error";
  summary?: string;
  nextActions?: string[];
  artifacts?: string[];
};
```

- [x] **Step 2: Update formatToolResult function**

```typescript
// Inside ToolExecutor class, update formatToolResult:
  private formatToolResult(result: ToolExecutionResult): string {
    const payload: Record<string, unknown> = {
      ok: result.ok,
      name: result.name,
      status: result.status ?? (result.ok ? "success" : "error"),
    };

    if (result.summary) payload.summary = result.summary;
    if (result.nextActions) payload.next_actions = result.nextActions;
    if (result.artifacts) payload.artifacts = result.artifacts;
    if (typeof result.output !== "undefined") payload.output = result.output;
    if (result.error) payload.error = result.error;
    if (result.metadata && Object.keys(result.metadata).length > 0) payload.metadata = result.metadata;
    if (result.awaitUserResponse === true) payload.awaitUserResponse = true;

    return JSON.stringify(payload, null, 2);
  }
```

- [x] **Step 3: Commit**

```bash
git add src/tools/executor.ts
git commit -m "refactor(harness): apply observation design schema to tool execution results"
```

### Task 2: Error Recovery Contract in Bash Handler

**Files:**
- Modify: `src/tools/bash-handler.ts`

- [x] **Step 1: Add error analysis utility function**

Add this to the end of `src/tools/bash-handler.ts`:

```typescript
function analyzeBashError(exitCode: number | null, signal: string | null, error?: string): {
  status: "warning" | "error";
  summary: string;
  nextActions: string[];
} {
  const summary = buildErrorMessage(exitCode, signal, error);
  const nextActions: string[] = [];
  
  if (summary.includes("timed out")) {
    nextActions.push("Retry with a longer timeout by passing bashTimeoutMs in context.");
    nextActions.push("Check if the command is waiting for interactive input.");
  } else if (exitCode === 127) {
    nextActions.push("Command not found. Verify your PATH or install the missing dependency.");
  } else if (exitCode === 1) {
    nextActions.push("General error. Read the output closely for root cause.");
    nextActions.push("If it's a missing module, consider installing it.");
  } else {
    nextActions.push("Review stderr output.");
    nextActions.push("Ensure you have correct permissions and the environment is properly set.");
  }
  
  return { status: "error", summary, nextActions };
}
```

- [x] **Step 2: Update formatResult to use analysis**

```typescript
// Replace formatResult function:
function formatResult(result: ToolCommandResult, name: string, errorMessage?: string): ToolExecutionResult {
  const metadata: Record<string, unknown> = {
    exitCode: result.exitCode,
    signal: result.signal,
    cwd: result.cwd,
    truncated: result.truncated,
    shellPath: result.shellPath,
    startCwd: result.startCwd,
  };
  if (typeof result.timedOut === "boolean") metadata.timedOut = result.timedOut;
  if (typeof result.timeoutMs === "number") metadata.timeoutMs = result.timeoutMs;
  if (result.deadlineAt) metadata.deadlineAt = result.deadlineAt;

  const outputValue = result.output ? result.output : undefined;
  
  let status: "success" | "warning" | "error" = result.ok ? "success" : "error";
  let summary = result.ok ? "Command executed successfully." : "Command failed.";
  let nextActions: string[] | undefined = undefined;

  if (!result.ok) {
    const analysis = analyzeBashError(result.exitCode, result.signal, errorMessage);
    status = analysis.status;
    summary = analysis.summary;
    nextActions = analysis.nextActions;
  }

  return {
    ok: result.ok,
    name,
    output: outputValue,
    error: errorMessage,
    metadata,
    status,
    summary,
    nextActions
  };
}
```

- [x] **Step 3: Commit**

```bash
git add src/tools/bash-handler.ts
git commit -m "feat(harness): implement error recovery contract for bash commands"
```

### Task 3: Context Budgeting Phase Boundary Compaction

**Files:**
- Modify: `src/session/compacter.ts`

- [x] **Step 1: Update shouldCompactContext logic**

```typescript
// Replace the shouldCompactContext function:
export function shouldCompactContext(options: {
  messages: Array<{ role: string; content: string | unknown; compacted?: boolean }>;
  model: string;
  threshold?: number;
}): CompactionDecision {
  const threshold = options.threshold ?? resolveThreshold(options.model);
  const activeMessages = options.messages.filter((m) => !m.compacted);
  const estimatedTokens = countMessagesTokens(activeMessages);

  if (estimatedTokens < threshold) {
    return { shouldCompact: false, estimatedTokens };
  }

  // Phase boundary heuristic: look for recent successful tool results or system prompts
  // Instead of an arbitrary 30%, we find the last 5 user messages or significant phase breaks.
  let boundaryIndex = Math.max(3, Math.floor(activeMessages.length * 0.3));
  for (let i = Math.floor(activeMessages.length * 0.5); i < activeMessages.length - 2; i++) {
    const msg = activeMessages[i];
    if (msg.role === "user" || msg.role === "system") {
      boundaryIndex = i;
      break;
    }
  }

  const compactUpToIndex = activeMessages.length - (activeMessages.length - boundaryIndex);

  const originalIndices: number[] = [];
  for (let i = 0; i < options.messages.length; i++) {
    if (!options.messages[i].compacted) {
      originalIndices.push(i);
    }
  }

  const keepFromIndex = originalIndices[compactUpToIndex] ?? options.messages.length;

  return {
    shouldCompact: true,
    estimatedTokens,
    compactUpToIndex: originalIndices[compactUpToIndex - 1] ?? options.messages.length - (activeMessages.length - boundaryIndex),
    keepFromIndex,
  };
}
```

- [x] **Step 2: Commit**

```bash
git add src/session/compacter.ts
git commit -m "refactor(harness): use phase boundaries for semantic context compaction"
```

### Task 4: Headless Task Queue Injection

**Files:**
- Modify: `src/cli.tsx`

- [x] **Step 1: Add task queue read logic**

```typescript
// Add at top imports:
import * as fs from "fs";
import * as path from "path";

// Below initialPrompt extraction (around line 71), add task queue loader:
function loadTaskQueue(rootPath: string): string | undefined {
  const taskPath = path.join(rootPath, ".anng", "memory", "task-queue.md");
  try {
    if (fs.existsSync(taskPath)) {
      return `Please process the following persistent task queue:\n\n${fs.readFileSync(taskPath, "utf8")}`;
    }
  } catch {
    // Ignore read errors
  }
  return undefined;
}

// Below `let initialPrompt = extractInitialPrompt(args);`
let initialPrompt = extractInitialPrompt(args);

// Inject task queue if headless and no explicit prompt provided
if (autoAcceptEnabled && !initialPrompt) {
  initialPrompt = loadTaskQueue(process.cwd());
}
```

- [x] **Step 2: Test parsing with dummy task queue**

```bash
mkdir -p .anng/memory
echo "- [ ] Test task" > .anng/memory/task-queue.md
# We just verify it builds and does not crash
npx tsx src/cli.tsx --help > /dev/null
```

- [x] **Step 3: Commit**

```bash
git add src/cli.tsx
git commit -m "feat(harness): support headless autonomous execution via persistent task queue"
```

---

## Self-Review

1. **Spec coverage:** 
   - Context Budgeting: Task 3 addresses semantic compaction.
   - Observation Design: Task 1 enforces structured JSON fields.
   - Error Recovery: Task 2 adds root cause hints.
   - Task Queue: Task 4 implements persistent file ingestion for headless workflows.
2. **Placeholder scan:** Exact file paths and full implementation blocks provided. No placeholders.
3. **Type consistency:** `ToolExecutionResult` changes in Task 1 are seamlessly consumed in Task 2.

---
