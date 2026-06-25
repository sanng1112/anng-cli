# ANNG-CLI Audit Report

This audit report documents critical, high, and medium-severity findings identified and fixed in the ANNG-CLI repository.

---

## Severity Classification
* **Critical / High**: Vulnerabilities or logic flaws that cause silent data loss, memory/cache corruption, or completely bypass cost-saving mechanisms (such as Anthropic prompt caching).
* **Medium**: Performance bottlenecks, memory leaks, or minor logic errors that inflate API costs or cause resource warnings.
* **Low**: Code formatting, styling, or minor unused variables/imports.

---

## Findings Summary

| ID | Finding Title | Severity | Affected Files |
|---|---|---|---|
| **1** | Sync-vs-Async Data Loss, Race Condition & Cache Pollution | High / Critical | `src/session/index.ts`, `src/cli.tsx` |
| **2** | Anthropic/Claude Prompt Caching (Prefix Caching) Bypass | High | `src/common/openai-message-converter.ts` |
| **3** | Token Inflation due to Failed Old Tool Message Truncation | Medium | `src/session/index.ts` |
| **4** | React State Update Memory Leaks | Medium | `src/ui/views/SettingsView.tsx`, `src/ui/views/TeamDpConfigView.tsx` |

---

## Detailed Findings

### Finding 1: Sync-vs-Async Data Loss, Race Condition & Cache Pollution
* **Severity**: High / Critical
* **File Paths & Line Numbers**:
  * `src/session/index.ts` (lines 119-122, lines 149-152)
  * `src/cli.tsx` (lines 90-95, lines 164-173)

#### Description
In `SessionManager`, when new session messages are added or modified, they are written to disk asynchronously via a file write queue (`globalFileWriteQueue`). However, because the CLI process was exiting immediately upon finishing headless operations or exiting the TUI, it did not await the completion of these queued writes. This resulted in silent data loss (incomplete or missing session files on disk).

Furthermore, because the `cachedSessionMessages` map was an instance variable of `SessionManager`, instantiating a new `SessionManager` immediately after another (common in quick CLI invocations) led to a race condition. The second instance would read the non-existent or stale file on disk, return an empty messages list, and cache this empty list in its own map. Even after the async write queue completed, any future queries using the second manager instance would serve the cached empty list, polluting the cache and losing all session updates.

#### Reproduction PoC (`scratch/poc_race.ts`)
The reproduction script programmatically demonstrates this race condition and cache pollution:
1. It instantiates `manager1` and creates a session.
2. It immediately instantiates `manager2` and reads session messages without waiting for the queue to drain. It verifies that `manager2` reads 0 messages (due to the async write not having hit the disk yet).
3. The empty list is cached inside `manager2`.
4. It awaits the write queue to finish.
5. It queries `manager2` again, confirming it still reads 0 messages due to cache pollution.
6. It queries a clean `manager3` which successfully reads all 4 messages from disk.

#### Code Fix Diff
```diff
diff --git a/src/session/index.ts b/src/session/index.ts
index 4739fb4..7eee436 100644
--- a/src/session/index.ts
+++ b/src/session/index.ts
@@ -119,6 +119,8 @@ class FileWriteQueue {
 }
 export const globalFileWriteQueue = new FileWriteQueue();
 
+const globalCachedSessionMessages = new Map<string, SessionMessage[]>();
+
 export class SessionManager {
   private readonly projectRoot: string;
   private readonly createOpenAIClient: CreateOpenAIClient;
@@ -149,7 +151,7 @@ export class SessionManager {
   private mcpToolDefinitions: ToolDefinition[] = [];
   private readonly messageConverter: OpenAIMessageConverter;
   private cachedSessionsIndex: SessionsIndex | null = null;
-  private cachedSessionMessages = new Map<string, SessionMessage[]>();
+  private readonly cachedSessionMessages = globalCachedSessionMessages;
 
   constructor(options: SessionManagerOptions) {
     this.projectRoot = options.projectRoot;
diff --git a/src/cli.tsx b/src/cli.tsx
index 7297aca..8818208 100644
--- a/src/cli.tsx
+++ b/src/cli.tsx
@@ -16,6 +16,7 @@ import { AppContainer } from "./ui";
 import { setOutputMode, runAgent, installSignalHandlers, writeErr } from "./harness";
 import type { AgentMode, OutputMode, HarnessConfig, RunResult } from "./harness";
 import { resolveCurrentSettings } from "./settings";
+import { globalFileWriteQueue } from "./session/index.js";
 
 // =============================================================================
 // Argument parsing
@@ -90,6 +91,7 @@ async function main(): Promise<void> {
   if (mode === "yolo" || mode === "plan" || mode === "zen" || outputMode === "json") {
     const result = await runHeadless(effectivePrompt);
     uninstallSignals();
+    await globalFileWriteQueue.awaitIdle();
     process.exit(result.finishReason === "completed" ? 0 : 1);
   }
 
@@ -164,9 +166,10 @@ async function startInteractiveTUI(): Promise<void> {
       startApp();
     };
 
-    inkInstance.waitUntilExit().then(() => {
+    inkInstance.waitUntilExit().then(async () => {
       if (!restarting) {
         restartRef.current = null;
+        await globalFileWriteQueue.awaitIdle();
         process.exit(0);
       }
     });
```

### Finding 2: Anthropic/Claude Prompt Caching (Prefix Caching) Bypass
* **Severity**: High
* **File Path & Line Numbers**: `src/common/openai-message-converter.ts` (lines 62-76)

#### Description
Anthropic Claude's prefix caching requires that cache checkpoints (breakpoints) are applied strictly sequentially from the start of the message sequence (index 0 onwards). The previous implementation scanned the messages list in reverse (`openAIMessages.length - 1` down to 0) to find the static system prompt to pin. In histories with multiple system-like messages or dynamic insertions, scanning backwards could match a later system message first, failing to cache the primary static system prompt at index 0. Because prefix caching is strictly prefix-based, failing to cache the very first block invalidated prompt caching for the entire subsequent sequence, causing full re-computation costs on every turn.

#### Code Fix Diff
```diff
diff --git a/src/common/openai-message-converter.ts b/src/common/openai-message-converter.ts
index 6940a2a..6f6b8bf 100644
--- a/src/common/openai-message-converter.ts
+++ b/src/common/openai-message-converter.ts
@@ -62,7 +62,7 @@ export class OpenAIMessageConverter {
     const isAnthropic = model.includes("claude") || model.includes("anthropic");
     if (isAnthropic && openAIMessages.length > 0) {
       // 1. Pin the static system prompt
-      for (let i = openAIMessages.length - 1; i >= 0; i--) {
+      for (let i = 0; i < openAIMessages.length; i++) {
         if (openAIMessages[i].role === "system") {
           // eslint-disable-next-line @typescript-eslint/no-explicit-any
           const sysMsg = openAIMessages[i] as any;
```

---

### Finding 3: Token Inflation due to Failed Old Tool Message Truncation
* **Severity**: Medium
* **File Path & Line Numbers**: `src/session/index.ts` (lines 1506-1518)

#### Description
The `truncateOldToolMessages` function is designed to truncate extremely long tool response contents that occur before the last 2 assistant replies in the message history to save tokens. However, the condition for counting assistant messages checked `activeMessages[i].role === "assistant" && activeMessages[i].content`. Since assistant messages that only execute tool calls do not contain text content (i.e. `content` is empty or null, only containing `tool_calls` structures), they were skipped in the count. This prevented the cutoff threshold from being reached, meaning long tool responses were never truncated, causing massive token inflation.

#### Code Fix Diff
```diff
diff --git a/src/session/index.ts b/src/session/index.ts
index 4739fb4..7eee436 100644
--- a/src/session/index.ts
+++ b/src/session/index.ts
@@ -1506,7 +1508,7 @@ ${agentInstructions}
 
     let cutoffId: string | null = null;
     for (let i = activeMessages.length - 1; i >= 0; i--) {
-      if (activeMessages[i].role === "assistant" && activeMessages[i].content) {
+      if (activeMessages[i].role === "assistant") {
         assistantMessageCount++;
         if (assistantMessageCount > cutoffAssistantCount) {
           cutoffId = activeMessages[i].id;
```

---

### Finding 4: React State Update Memory Leaks
* **Severity**: Medium
* **File Paths & Line Numbers**:
  * `src/ui/views/SettingsView.tsx` (lines 1-4, lines 47-70, lines 475-515)
  * `src/ui/views/TeamDpConfigView.tsx` (lines 1-4, lines 19-30, lines 77-85)

#### Description
Both React views used `setTimeout` to clear status text (e.g. testing model connections or starting execution plans) or invoke cancellation callbacks. However, if the user navigated away and unmounted the component before the timeouts fired, the deferred callbacks would attempt to set state on unmounted components. This led to React memory leaks and state update warnings in the console.

#### Code Fix Diff

##### SettingsView Fix:
```diff
diff --git a/src/ui/views/SettingsView.tsx b/src/ui/views/SettingsView.tsx
index a6337a4..75f338f 100644
--- a/src/ui/views/SettingsView.tsx
+++ b/src/ui/views/SettingsView.tsx
@@ -1,4 +1,4 @@
-import React, { useState, useMemo } from "react";
+import React, { useState, useMemo, useRef, useEffect } from "react";
 import { Box, Text } from "ink";
 import { useTerminalInput } from "../hooks/useTerminalInput";
 import DropdownMenu, { type DropdownMenuItem } from "../components/DropdownMenu";
@@ -47,6 +47,28 @@ const COMMON_BASE_URLS = [
 
 export function SettingsView({ projectRoot, onExit }: { projectRoot: string; onExit: () => void }) {
   const [resolved, setResolved] = useState<ResolvedDeepcodingSettings>(() => resolveCurrentSettings(projectRoot));
+  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
+
+  const showTestResult = (msg: string | null, delay?: number) => {
+    setTestResult(msg);
+    if (timeoutRef.current) {
+      clearTimeout(timeoutRef.current);
+      timeoutRef.current = null;
+    }
+    if (msg !== null && delay !== undefined) {
+      timeoutRef.current = setTimeout(() => {
+        setTestResult(null);
+      }, delay);
+    }
+  };
+
+  useEffect(() => {
+    return () => {
+      if (timeoutRef.current) {
+        clearTimeout(timeoutRef.current);
+      }
+    };
+  }, []);
   const [projectSettings, setProjectSettings] = useState<DeepcodingSettings>(
     () => readProjectSettings(projectRoot) || {}
   );
@@ -475,11 +497,10 @@ export function SettingsView({ projectRoot, onExit }: { projectRoot: string; onE
         const allProviders = loadProviders(projectRoot);
         const provider = allProviders.length > 0 ? allProviders[0] : null;
         if (!provider || !provider.apiKey) {
-          setTestResult(`❌ ${modelName}: No provider configured`);
-          setTimeout(() => setTestResult(null), 4000);
+          showTestResult(`❌ ${modelName}: No provider configured`, 4000);
           return;
         }
-        setTestResult(`⏳ Testing ${modelName} with ${provider.id}...`);
+        showTestResult(`⏳ Testing ${modelName} with ${provider.id}...`);
         import("openai")
           .then(({ default: OpenAI }) => {
             const client = new OpenAI({
@@ -497,13 +518,11 @@ export function SettingsView({ projectRoot, onExit }: { projectRoot: string; onE
             const newModels = models.map((m) => (m.name === modelName ? { ...m, tested: true } : m));
             setModels(newModels);
             saveModels(projectRoot, newModels);
-            setTestResult(`✅ ${modelName} with ${provider.id}: OK`);
-            setTimeout(() => setTestResult(null), 5000);
+            showTestResult(`✅ ${modelName} with ${provider.id}: OK`, 5000);
           })
           .catch((err) => {
             const msg = err instanceof Error ? err.message : String(err);
-            setTestResult(`❌ ${modelName} with ${provider.id}: ${msg}`);
-            setTimeout(() => setTestResult(null), 8000);
+            showTestResult(`❌ ${modelName} with ${provider.id}: ${msg}`, 8000);
           });
       }
       return;
```

##### TeamDpConfigView Fix:
```diff
diff --git a/src/ui/views/TeamDpConfigView.tsx b/src/ui/views/TeamDpConfigView.tsx
index c5adddb..ef4dc1d 100644
--- a/src/ui/views/TeamDpConfigView.tsx
+++ b/src/ui/views/TeamDpConfigView.tsx
@@ -1,4 +1,4 @@
-import React, { useState, useEffect, useMemo } from "react";
+import React, { useState, useEffect, useMemo, useRef } from "react";
 import { Box, Text, useInput } from "ink";
 import fs from "fs";
 import path from "path";
@@ -19,6 +19,15 @@ export function TeamDpConfigView({ initialPrompt, onCancel, projectRoot }: TeamD
   const [plan, setPlan] = useState<DpExecutionPlan | null>(null);
   const [errorMsg, setErrorMsg] = useState<string | null>(null);
   const [orchestrator] = useState(() => new DpOrchestrator(projectRoot));
+  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
+
+  useEffect(() => {
+    return () => {
+      if (timeoutRef.current) {
+        clearTimeout(timeoutRef.current);
+      }
+    };
+  }, []);
 
   // Navigation states
   const [execCursor, setExecCursor] = useState(0);
@@ -77,7 +86,7 @@ export function TeamDpConfigView({ initialPrompt, onCancel, projectRoot }: TeamD
             setPlan({ ...updatedPlan });
             if (updatedPlan.status === "completed" || updatedPlan.status === "failed") {
               setPhase("done");
-              setTimeout(() => {
+              timeoutRef.current = setTimeout(() => {
                 onCancel();
               }, 2000);
             }
```

---

## Go Runtime Follow-up

The current worktree also includes a Go-side remediation pass for the runtime gaps documented during the migration effort. This does not replace the TypeScript audit above; it records the corresponding fixes now present in the Go implementation.

### Go remediations now present

* **Thinking and provider state now affect runtime requests.**
  Evidence: [orchestrator.go](</run/media/sanng/New Volume/Seminar/Anng_cli/internal/agent/orchestrator.go:104>), [headless.go](</run/media/sanng/New Volume/Seminar/Anng_cli/internal/agent/headless.go:19>), [main.go](</run/media/sanng/New Volume/Seminar/Anng_cli/cmd/anng/main.go:160>), [provider.go](</run/media/sanng/New Volume/Seminar/Anng_cli/internal/agent/provider.go:17>).

* **Gemini/Google is now a first-class provider path in Go config and credential resolution.**
  Evidence: [config.go](</run/media/sanng/New Volume/Seminar/Anng_cli/internal/config/config.go:8>), [provider.go](</run/media/sanng/New Volume/Seminar/Anng_cli/internal/agent/provider.go:49>), [app.go](</run/media/sanng/New Volume/Seminar/Anng_cli/internal/tui/app.go:60>).

* **MCP tool registration is now tied to the orchestrator run lifecycle and has an end-to-end regression test.**
  Evidence: [orchestrator.go](</run/media/sanng/New Volume/Seminar/Anng_cli/internal/agent/orchestrator.go:104>), [orchestrator_test.go](</run/media/sanng/New Volume/Seminar/Anng_cli/internal/agent/orchestrator_test.go:131>).

* **Context compaction is no longer hard-coded to 4000 tokens for every model.**
  Evidence: [provider.go](</run/media/sanng/New Volume/Seminar/Anng_cli/internal/agent/provider.go:92>), [orchestrator.go](</run/media/sanng/New Volume/Seminar/Anng_cli/internal/agent/orchestrator.go:155>).

* **System prompt construction is split into a stable prefix and a runtime overlay to improve cacheability.**
  Evidence: [prompt_engine.go](</run/media/sanng/New Volume/Seminar/Anng_cli/internal/agent/prompt_engine.go:39>), [prompt_engine_test.go](</run/media/sanng/New Volume/Seminar/Anng_cli/internal/agent/prompt_engine_test.go:38>).

### Go verification performed

* `conda run -n go_env env CGO_ENABLED=0 GOCACHE=/tmp/go-build go test ./internal/agent ./internal/config ./internal/tui ./cmd/anng`
* `conda run -n go_env env CGO_ENABLED=0 GOCACHE=/tmp/go-build go test ./internal/agent -run 'TestRunRegistersAndExecutesMCPTools|TestPromptEngineBuildsSystemPrompt|TestPromptEngineSeparatesStaticPrefixFromRuntimeOverlay|TestResolveProvider|TestDefaultBaseURL|TestResolveCredentials|TestNormalizeReasoningEffort|TestCompactThreshold'`
* `conda run -n go_env env CGO_ENABLED=0 GOCACHE=/tmp/go-build go test ./... -run '^$'`
