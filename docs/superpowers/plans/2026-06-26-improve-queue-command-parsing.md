# Improve Queue Command Parsing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve `/queue` slash command parsing so that if the first argument is not a known subcommand (`clear`, `process`, `run`), the entire input is treated as a task description to be added to the queue (e.g. `/queue my task` will add `"my task"` directly).

**Architecture:** Update the command handling logic in `src/ui/views/App.tsx` where the `"queue"` command is processed.

**Tech Stack:** React 19, TypeScript

---

### Task 1: Update command handling in App.tsx

**Files:**
- Modify: `src/ui/views/App.tsx:638-669`

- [ ] **Step 1: Replace queue command parsing logic**

Replace:
```typescript
      if ((submission.command as string) === "queue") {
        const text = submission.text.trim();
        const parts = text.startsWith("/queue") ? text.slice(6).trim().split(/\s+/) : text.split(/\s+/);
        const subCmd = parts[0]?.toLowerCase();
        const taskText = parts.slice(1).join(" ");

        if ((subCmd === "add" || !subCmd) && taskText) {
          const qList = queueListQueues(projectRoot);
          const qName = qList.length > 0 ? qList[0].name : "main";
          const task = queueAddTask(projectRoot, qName, taskText);
          if (task) {
            setMessages((prev) => [...prev, buildSyntheticUserMessage(`📋 Queued: "${taskText.slice(0, 80)}"`, 0)]);
            setStatusLine(`Task queued: "${taskText.slice(0, 60)}"`);
          } else {
            setErrorLine("Failed to queue task");
          }
          return;
        }
        if (subCmd === "clear") {
          const { clearQueue: clearQ } = await import("../../common/task-queue");
          const qList = queueListQueues(projectRoot);
          if (qList.length > 0 && clearQ(projectRoot, qList[0].name)) setStatusLine("Queue cleared");
          else setErrorLine("Failed to clear queue");
          return;
        }
        if (subCmd === "process" || subCmd === "run") {
          navigateToSubView("queue");
          return;
        }
        navigateToSubView("queue");
        return;
      }
```

With:
```typescript
      if ((submission.command as string) === "queue") {
        const text = submission.text.trim();
        const parts = text.startsWith("/queue") ? text.slice(6).trim().split(/\s+/) : text.split(/\s+/);
        const subCmd = parts[0]?.toLowerCase();

        const knownSubcmds = ["add", "clear", "process", "run"];
        let isAdd = subCmd === "add" || !subCmd;
        let taskText = parts.slice(1).join(" ");

        if (subCmd && !knownSubcmds.includes(subCmd)) {
          isAdd = true;
          taskText = parts.join(" ");
        }

        if (isAdd && taskText) {
          const qList = queueListQueues(projectRoot);
          const qName = qList.length > 0 ? qList[0].name : "main";
          const task = queueAddTask(projectRoot, qName, taskText);
          if (task) {
            setMessages((prev) => [...prev, buildSyntheticUserMessage(`📋 Queued: "${taskText.slice(0, 80)}"`, 0)]);
            setStatusLine(`Task queued: "${taskText.slice(0, 60)}"`);
          } else {
            setErrorLine("Failed to queue task");
          }
          return;
        }
        if (subCmd === "clear") {
          const { clearQueue: clearQ } = await import("../../common/task-queue");
          const qList = queueListQueues(projectRoot);
          if (qList.length > 0 && clearQ(projectRoot, qList[0].name)) setStatusLine("Queue cleared");
          else setErrorLine("Failed to clear queue");
          return;
        }
        if (subCmd === "process" || subCmd === "run") {
          navigateToSubView("queue");
          return;
        }
        navigateToSubView("queue");
        return;
      }
```

- [ ] **Step 2: Run typecheck and quality check**

Run: `npm run check`
Expected: Passes with no errors.

- [ ] **Step 3: Build the application**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit changes**

Run: `git commit -am "fix(ui): improve queue command parsing to allow direct task adding"`
