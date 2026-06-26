# Current Progress

## Summary

This file captures the current implementation progress and known state of the project as of 2026-06-26.

## Completed

- Refactored the shared dropdown UI to remove rigid boxed rendering and scale better with terminal width.
- Updated the settings menu UI to use responsive width and height based on the terminal instead of fixed `80/76` sizing.
- Improved settings visual hierarchy with a softer divider-based layout and clearer status/header display.
- Fixed the queue runner so it no longer stops at "load next prompt into input".
- Queue processing now auto-runs the next pending task instead of waiting for the user to press Enter again.
- Queue processing now pauses correctly when the agent reaches:
  - `waiting_for_user`
  - `ask_permission`
  - `permission_denied`
- Fixed duplicate queue insertion when the AI is already busy.
- Added queue helper logic to find the next pending task while preferring the current queue first.
- Added regression tests for queue task selection order.
- Implemented and integrated the deeper web search tools:
  - Added the `searchweb` tool (mapping to standard web search handler).
  - Added the new `searchsegment` tool (fetching webpages and converting HTML elements directly into clean Markdown).
  - Registered both tools to the LLM agent prompt.
- Propagated the new responsive visual treatment to the remaining boxed views:
  - **Queue View** (`src/ui/views/QueueView.tsx`)
  - **Background Process View** (`src/ui/views/BackgroundProcessesView.tsx`)
  - **Query View** (`src/ui/views/QueryView.tsx`)
- Reviewed and verified `/queue process` slash-command behavior to ensure it triggers queue execution identically to queue-view processing.

## Current Queue Behavior

- Processing a queue task from the queue view now starts execution immediately.
- After a task completes successfully, the next pending queue task is picked and submitted automatically.
- If the assistant needs user input or permission, queue execution pauses and preserves queue context for continuation.
- Queue completion now ends with `Queue complete — all tasks processed ✓`.

## Files Changed In This Progress Window

- `src/ui/components/DropdownMenu/index.tsx`
- `src/ui/views/SettingsView.tsx`
- `src/ui/views/App.tsx`
- `src/ui/views/PromptInput.tsx`
- `src/ui/views/QueueView.tsx`
- `src/ui/views/BackgroundProcessesView.tsx`
- `src/ui/views/QueryView.tsx`
- `src/common/task-queue.ts`
- `src/tools/searchsegment-handler.ts`
- `src/tools/executor.ts`
- `src/prompt.ts`
- `templates/tools/searchweb.md`
- `templates/tools/searchsegment.md`
- `src/tests/task-queue.test.ts`
- `src/tests/searchsegment.test.ts`

## Verification Run

- `npm run typecheck`
- `npm test` (All 601 tests passed, including new `searchsegment` unit tests)
- `npx eslint src/ui/views/App.tsx src/ui/views/PromptInput.tsx src/common/task-queue.ts src/tests/task-queue.test.ts`
- `npx prettier --check src/ui/views/App.tsx src/ui/views/PromptInput.tsx src/common/task-queue.ts src/tests/task-queue.test.ts`

## Remaining / Not Yet Done

- None (All specified items for this progress window are fully completed and verified).

## Notes

- There are unrelated existing worktree changes in other files, so edits were kept scoped to the queue, tools, and UI areas above.
