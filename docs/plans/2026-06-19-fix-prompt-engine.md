# Fix Prompt Engineering Module Issues ✅

> Historical implementation plan: this dated note reflects the TypeScript-era prompt-engine structure and is preserved as migration history rather than current Go runtime documentation.

## Vấn đề đã xác định

1. ✅ **Module name collision**: `src/prompt/` (dir) vs `src/prompt.ts` (file)
2. ✅ **New modules không được integrate**: `buildSystemPrompt()` được gọi trong session flow
3. ✅ **Runtime context duplicate**: run-agent.ts không còn append runtime context
4. ✅ **Shell bug**: `getCommandVersion()` fixed — dùng `execFileSync`

## Kế hoạch xử lý

### Step 1: Rename `src/prompt/` → `src/prompt-engine/` ✅
- Renamed directory
- Internal imports đều relative (ko cần update)

### Step 2: Fix shell bug in metadata.ts ✅
- Dùng `execFileSync` pattern như code gốc
- Thêm quoting (single quote)
- On Windows: `execFileSync(bashPath, ["-lc", cmd])`
- On Linux: `execSync` with shell

### Step 3: Integrate `buildSystemPrompt()` vào session flow ✅
- Session `createSession()` dùng `buildSystemPrompt()` cho base prompt
- Runtime context giữ là system message riêng (prefix caching)
- Capabilities giữ là system message riêng
- Agent instructions (AGENTS.md) giữ là system message riêng
- Thứ tự layers: base → capabilities → runtime → agent instructions → user

### Step 4: Clean up run-agent.ts ✅
- Bỏ `getRuntimeContext` import & usage
- Chỉ pass user prompt text (ko runtime context)
- Runtime context đã có trong system prompt qua session

### Step 5: Test ✅
- `tsc --noEmit` ✅ 0 errors
- `eslint src/` ✅ 0 errors, 0 warnings
- `prettier --check` ✅ All files use Prettier style
- `session.test.ts` ✅ 89/89 pass
- `prompt.test.ts` + 18 test files ✅ 234/234 pass (1 skip pre-existing)

## File changes

| File | Type | Description |
|------|------|-------------|
| `src/prompt-engine/templates.ts` | **New** | System prompt templates with `{{PLACEHOLDER}}` |
| `src/prompt-engine/builder.ts` | **New** | `buildSystemPrompt()` — structured builder |
| `src/prompt-engine/metadata.ts` | **New** | `buildWorkspaceMetadata()` — structured metadata |
| `src/prompt-engine/index.ts` | **New** | Public API exports |
| `src/session/index.ts` | **Modified** | Uses `buildSystemPrompt()` + retains separate layers |
| `src/harness/run-agent.ts` | **Modified** | Removed runtime context from user message |
| `src/ui/core/slash-commands.ts` | **Refactored** | Source classification + command expansion |
| `src/tests/session.test.ts` | **Modified** | Updated test to match new base prompt format |
| `docs/plans/2026-06-19-fix-prompt-engine.md` | **New** | This plan document |
