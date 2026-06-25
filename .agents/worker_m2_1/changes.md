# Change Summary

## Modified Files and Changes

### 1. `src/session/index.ts`
- **Shared Cache**: Defined a module-level global cache:
  ```typescript
  const globalCachedSessionMessages = new Map<string, SessionMessage[]>();
  ```
  And configured `SessionManager` to use it:
  ```typescript
  private readonly cachedSessionMessages = globalCachedSessionMessages;
  ```
  This guarantees that all `SessionManager` instances share the same message cache, preventing the race condition (reading empty messages) and cache pollution (where a re-querying manager reads clean data only after the file write queue is flushed, but might have stale cache in the meantime).
- **Assistant Message Count in Truncation**: Corrected the condition inside `truncateOldToolMessages` from checking `activeMessages[i].content` to checking just `role === "assistant"`:
  ```typescript
  if (activeMessages[i].role === "assistant")
  ```
  This ensures assistant messages that invoke tools (and therefore have empty or falsy `content`) are counted towards the truncation cutoff, preventing token inflation.

### 2. `src/cli.tsx`
- Awaited the global file write queue before calls to `process.exit()`:
  - Imported `globalFileWriteQueue` from `./session/index.js`.
  - Added `await globalFileWriteQueue.awaitIdle()` inside both `runHeadless` completion block and `startInteractiveTUI` unmount/completion callback.

### 3. `src/common/openai-message-converter.ts`
- **System Prompt Caching Loop**: Modified the caching loop in `buildMessages`. Instead of iterating backward from the end (which matched `workspaceMessage` and broke), it now iterates forward from index 0 and applies `cache_control` to the FIRST message with role "system", then breaks.

### 4. `src/ui/views/SettingsView.tsx` & `src/ui/views/TeamDpConfigView.tsx`
- **React State Memory Leaks**:
  - Imported `useRef` and `useEffect`.
  - Stored timeout IDs in a React `useRef` and added `useEffect` cleanup functions to clear the timeouts on component unmount.

### 5. Test Files (`src/tests/session.test.ts` & `src/tests/slash-commands.test.ts`)
- Updated tests to match the current template rules and new slash commands (`team-dp` and `team-wf`).

## Build and Test Status
- Build: Compilation & formatting check passed cleanly (`npm run build` succeeded).
- Tests: All 596 tests passed successfully (`npm test` succeeded).
