## 2026-06-20T07:01:19Z

You are teamwork_preview_worker. Your working directory is /run/media/sanng/New Volume/Seminar/Anng_cli/.agents/worker_m2_1.
Your task is to implement the fixes for the 4 identified issues and verify them.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Here are the 4 issues to resolve:
1. Sync-vs-Async Session Message Race Condition, Data Loss, & Cache Pollution:
   - In `src/session/index.ts`, define a module-level global cache:
     const globalCachedSessionMessages = new Map<string, SessionMessage[]>();
     And modify SessionManager to use it:
     private readonly cachedSessionMessages = globalCachedSessionMessages;
     This ensures all SessionManager instances share the cache.
   - In `src/cli.tsx`, import `globalFileWriteQueue` and await `globalFileWriteQueue.awaitIdle()` before calling process.exit() in runHeadless and startInteractiveTUI (specifically when completing execution).
2. Anthropic/Claude Prompt Caching (Prefix Caching) Bypass:
   - In `src/common/openai-message-converter.ts`, modify the static system prompt caching loop. Instead of iterating backward from the end (which matches the dynamic `workspaceMessage` and breaks), iterate forward from index 0 and apply `cache_control` to the FIRST message with role "system", then break.
3. Token Inflation due to Failed Old Tool Message Truncation:
   - In `src/session/index.ts` inside `truncateOldToolMessages`, change the condition:
     if (activeMessages[i].role === "assistant" && activeMessages[i].content)
     to:
     if (activeMessages[i].role === "assistant")
     This ensures that assistant messages invoking tools (which have falsy content) are counted correctly towards the truncation cutoff.
4. React State Update Memory Leaks:
   - In `src/ui/views/SettingsView.tsx` and `src/ui/views/TeamDpConfigView.tsx`, use React `useRef` to store the timeout IDs and clear them on unmount using `useEffect`.

Please execute these steps:
1. Create `scratch/` directory at the project root if it doesn't exist, and write the reproduction PoC script to `scratch/poc_race.ts` (you can copy/adapt the one from `/run/media/sanng/New Volume/Seminar/Anng_cli/.agents/explorer_m1_1/poc_race.ts`).
2. Run the PoC script on the unmodified codebase using tsx (e.g. `npx tsx scratch/poc_race.ts`) to confirm it reproduces the bugs. Record the output.
3. Apply the 4 fixes to the codebase.
4. Run the project's build step (`npm run build` or `npm run typecheck` or `tsc`) to ensure it compiles without errors.
5. Run the PoC script again to verify the race condition is resolved (confirm manager2 now reads the saved messages immediately and cache is not polluted).
6. Write a summary of your changes to `/run/media/sanng/New Volume/Seminar/Anng_cli/.agents/worker_m2_1/changes.md`.
7. Write your handoff report to `/run/media/sanng/New Volume/Seminar/Anng_cli/.agents/worker_m2_1/handoff.md`.
8. Send a message to the orchestrator (conversation ID fa276971-c9e1-4723-8a51-1a0eb9105b3e) when done, providing the path to your handoff.
