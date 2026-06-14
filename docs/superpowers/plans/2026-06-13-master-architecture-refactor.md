# DeepCode CLI — Master Architecture Refactor Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the deepcode-cli codebase from a monolithic God Object architecture into a clean, maintainable, testable modular system with bounded contexts, while preserving all existing functionality and test coverage.

**Architecture:** This is a cross-cutting architectural refactor spanning 4 subsystems. We split SessionManager (2834 lines) into 5 focused services, decompose App.tsx (881 lines) using a state machine pattern, break edit-handler.ts (867 lines) into strategy classes, and harden the system with error boundaries, E2E tests, architecture docs, and i18n infrastructure.

**Tech Stack:** TypeScript (strict), React/Ink 7, Node.js ≥22, ESM, esbuild bundler, Node.js native test runner, Zod validation.

---

I'm using the writing-plans skill to create the implementation plan.

---
# Repository Intelligence

## Build System
- **Package Manager:** npm
- **Build:** esbuild (single-file bundle `src/cli.tsx` → `dist/cli.js`)
- **TypeScript:** `tsconfig.json` — strict mode, ESM, JSX react-jsx
- **Watch/Dev:** `npx tsx src/cli.tsx`

## Runtime
- **Platform:** Node.js ≥22
- **Shell:** Interactive TUI via Ink (React for terminal)
- **Binary:** `dist/cli.js` (shebang `#!/usr/bin/env node`)

## Package Management
- **Dependencies:** chalk, ejs, gradient-string, gray-matter, ignore, ink, ink-gradient, js-tiktoken, openai, react, undici, unpdf, zod
- **Dev Dependencies:** @types/node, @types/react, esbuild, eslint, glob, husky, lint-staged, prettier, tsx, typescript

## Testing Frameworks
- **Runner:** Node.js native test runner (`node --import tsx --test`)
- **Concurrency:** `--test-concurrency=4`
- **Coverage:** `node --experimental-test-coverage`
- **Test files:** 33 files in `src/tests/`
- **Entry:** `src/tests/run-tests.mjs` (glob-based parallel test discovery)

## CI/CD
- **Platform:** GitHub Actions
- **Matrix:** Ubuntu + Windows + macOS × Node 20/22/24
- **Quality Gates:** typecheck → lint → format check → bundle → test
- **Pre-commit:** Husky + lint-staged

## Module Layout
```
src/
├── cli.tsx                    [entry point, 155 lines]
├── session.ts                 [SessionManager, 2834 lines ⚠️ God Object]
├── settings.ts                [settings resolution, 620 lines]
├── prompt.ts                  [system prompts + tools, 685 lines]
├── common/                    [shared utilities, 17 files]
│   ├── openai-client.ts
│   ├── openai-message-converter.ts  [278 lines]
│   ├── openai-thinking.ts
│   ├── permissions.ts              [554 lines]
│   ├── file-history.ts             [git undo]
│   ├── file-utils.ts
│   ├── state.ts                    [session file state]
│   ├── tokenizer.ts
│   ├── bash-timeout.ts
│   ├── shell-utils.ts              [cross-platform shell]
│   ├── process-tree.ts
│   ├── validate.ts                 [Zod wrapper]
│   ├── notify.ts
│   ├── telemetry.ts
│   ├── debug-logger.ts
│   ├── error-logger.ts
│   ├── model-capabilities.ts
│   ├── update-check.ts
│   └── key-rotator.ts
├── tools/                     [tool handlers, 7 files]
│   ├── executor.ts            [registry-based dispatch, Strategy Pattern]
│   ├── bash-handler.ts        [400+ lines, error recovery contracts]
│   ├── read-handler.ts        [PDF + stream reading]
│   ├── write-handler.ts
│   ├── edit-handler.ts        [867 lines ⚠️ too complex]
│   ├── ask-user-question-handler.ts
│   ├── update-plan-handler.ts
│   └── web-search-handler.ts
├── mcp/                       [MCP protocol]
│   ├── mcp-client.ts          [451 lines, JSON-RPC over stdio]
│   └── mcp-manager.ts         [524 lines]
├── session/                   [session sub-modules]
│   ├── compacter.ts           [context compaction]
│   └── store.ts               [session store]
├── ui/                        [Ink/React terminal UI]
│   ├── views/                 [13 view components]
│   ├── components/            [6 component groups]
│   ├── contexts/
│   ├── hooks/
│   ├── core/
│   └── utils/
└── tests/                     [33 test files]
```

## Existing Architectural Patterns
1. **Strategy Pattern**: ToolExecutor uses registry-based handler dispatch (`Map<string, ToolHandler>`)
2. **Observer Pattern**: SessionManager uses callbacks (onAssistantMessage, onLlmStreamProgress, etc.)
3. **Factory Pattern**: `createOpenAIClient` creates configured OpenAI client instances
4. **Singleton Pattern**: SessionManager instantiated once in App.tsx
5. **Repository Pattern**: SessionStore for JSONL-based session persistence

## Existing Conventions
- All imports use ES module syntax
- TypeScript strict mode with `consistent-type-imports`
- Prettier: semi, singleQuote false, trailingComma es5, printWidth 120
- ESLint: react-hooks exhaustive-deps
- Git commits: semantic prefixes (feat, refactor, test, docs, perf, chore)
- Error handling: try/catch with type-safe error messages
- Validation: Zod schemas via `executeValidatedTool` wrapper

## Similar Features
- **Nearest existing DI-like pattern**: `CreateOpenAIClient` callback injected into SessionManager
- **Nearest existing service split**: `session/store.ts` and `session/compacter.ts` already extracted
- **Nearest existing state machine**: None — App.tsx uses ad-hoc useState

---
# Scope Analysis

## Feature Classification: **Architectural (Cross-Cutting)**

This refactor touches all 5 bounded contexts of the application:

### Subsystem A: SessionManager Decomposition
- Extract: SessionStore, ConversationLoop, SkillMatcher, CompactionService, NotificationService, UndoService
- **Dependency on:** Subsystem B (permissions must be stable)

### Subsystem B: App.tsx State Machine
- Replace 18 useState calls with useReducer + state machine
- Add ErrorBoundary component
- **Dependency on:** Subsystem A (SessionManager interface changes propagate)

### Subsystem C: Edit Handler Strategy Decomposition
- Extract matching strategies: ExactMatchStrategy, TabCorrectedMatchStrategy, LooseEscapeMatchStrategy, LLMCorrectedMatchStrategy
- **Independent:** No dependencies on A or B

### Subsystem D: Infrastructure Hardening
- Architecture docs (ADRs, module dependency diagram)
- E2E smoke tests
- i18n infrastructure for system prompts
- Error boundary for Ink/React
- **Independent but integrates with A, B, C**

---

# Bounded Context Analysis

| Context | Responsibility | Current State | Target State |
|---------|---------------|---------------|-------------|
| Session Management | CRUD, persistence, lifecycle | `session.ts` + `session/store.ts` | `session/SessionStore.ts` + `session/SessionLifecycle.ts` |
| Conversation Loop | LLM → tools → LLM cycle | `session.ts::activateSession` | `session/ConversationLoop.ts` |
| Skill Matching | LLM-based skill selection | `session.ts` inline | `session/SkillMatcher.ts` |
| Context Compaction | Token-aware context compression | `session/compacter.ts` | `session/CompactionService.ts` |
| Permission System | Scope-based tool authorization | `common/permissions.ts` | Stable (no refactor needed) |
| Tool Execution | Registry-based handler dispatch | `tools/executor.ts` | Stable, add edit strategies |
| MCP Protocol | Multi-server MCP client | `mcp/` | Stable |
| UI State | Terminal UI rendering | `ui/views/App.tsx` | `ui/state/AppStateMachine.ts` + `ui/views/App.tsx` |

---

# Dependency Surface

```
SessionManager (to be decomposed)
  ├──► permissions.ts         [STABLE — no changes]
  ├──► compacter.ts           [REFACTOR → CompactionService]
  ├──► openai-message-converter [STABLE]
  ├──► openai-client.ts       [STABLE]
  ├──► openai-thinking.ts     [STABLE]
  ├──► prompt.ts              [MINOR — i18n strings]
  ├──► tools/executor.ts      [MINOR — edit strategy extraction]
  ├──► mcp/mcp-manager.ts     [STABLE]
  ├──► common/file-history.ts [REFACTOR → UndoService]
  ├──► common/state.ts        [STABLE]
  ├──► common/notify.ts       [REFACTOR → NotificationService]
  ├──► common/telemetry.ts    [STABLE]
  ├──► common/tokenizer.ts    [STABLE]
  └──► common/validate.ts     [STABLE]

App.tsx (to be refactored)
  ├──► SessionManager         [INTERFACE CHANGE — new service methods]
  ├──► ui/components/*        [STABLE]
  ├──► ui/views/*             [STABLE]
  ├──► ui/core/*              [STABLE]
  ├──► ui/hooks/*             [STABLE]
  └──► ui/contexts/*          [MINOR — add ErrorBoundary context]
```

---
# Impact Matrix

| Area | Impact | Risk | Tests Required |
|------|--------|------|----------------|
| `src/session.ts` | HIGH (split into 5 files) | HIGH (regression risk) | 30+ existing session tests must pass |
| `src/session/compacter.ts` | MEDIUM (rename, add interface) | LOW | Existing compacter tests |
| `src/session/store.ts` | LOW (already separate) | LOW | Existing store tests |
| `src/ui/views/App.tsx` | HIGH (useReducer refactor) | MEDIUM (UI behavior) | All existing UI tests + new state machine tests |
| `src/ui/views/AppContainer.tsx` | MEDIUM (add ErrorBoundary) | LOW | New ErrorBoundary tests |
| `src/tools/edit-handler.ts` | HIGH (strategy extraction) | MEDIUM (edit logic) | All existing edit handler tests |
| `src/common/file-history.ts` | MEDIUM (wrap in UndoService) | LOW | Existing file-history tests |
| `src/common/notify.ts` | LOW (wrap in service) | LOW | Existing notify tests |
| `src/prompt.ts` | MEDIUM (i18n extraction) | MEDIUM (prompt content) | All existing prompt tests |
| `src/cli.tsx` | LOW (no changes) | LOW | Existing CLI tests |
| CI/CD | NONE | NONE | N/A |
| Docs | NEW (architecture docs) | LOW | N/A |
| `docs/` | NEW (ADRs, diagrams) | LOW | N/A |
| `src/tests/` | NEW (E2E smoke tests) | LOW | New E2E test files |
| `src/ui/components/ErrorBoundary.tsx` | EXISTS (enhance) | LOW | New ErrorBoundary tests |
| Permissions | NONE | NONE | Existing permissions tests |
| Security | NONE | NONE | Existing security coverage |
| Observability | NONE | NONE | All telemetry unchanged |

---

# Proposed Architecture

## Component Diagram (After Refactor)

```
┌─────────────────────────────────────────────────────────────────┐
│                        cli.tsx (entry)                          │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │ --yolo flag   │  │ --plan flag      │  │ task-queue.md    │  │
│  └──────────────┘  └──────────────────┘  └──────────────────┘  │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                   AppContainer + ErrorBoundary                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  App.tsx (refactored: useReducer state machine)          │   │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌─────────┐  │   │
│  │  │ Chat View  │ │Sessions   │ │ Undo      │ │ MCP     │  │   │
│  │  └───────────┘ └───────────┘ └───────────┘ └─────────┘  │   │
│  └──────────────────────┬───────────────────────────────────┘   │
└─────────────────────────┼───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SessionManager (refactored)                   │
│                                                                  │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │ SessionStore  │  │ ConversationLoop │  │  SkillMatcher    │  │
│  │ (CRUD + JSONL)│  │ (LLM ↔ tools)   │  │ (LLM skill pick) │  │
│  └──────────────┘  └──────────────────┘  └──────────────────┘  │
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │ CompactionService │  │ UndoService      │  │Notification  │  │
│  │ (phase-boundary)  │  │ (git checkpoint)  │  │ Service      │  │
│  └──────────────────┘  └──────────────────┘  └──────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  ToolExecutor (stable, no refactor)                      │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────────────┐   │   │
│  │  │  Bash    │ │  Read   │ │  Write  │ │  Edit        │   │   │
│  │  │  Handler │ │  Handler│ │  Handler│ │  Handler      │   │   │
│  │  │          │ │         │ │         │ │ [strategies] │   │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └──────────────┘   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  MCP Manager (stable)                                     │   │
│  │  ┌──────────────┐                                         │   │
│  │  │ MCP Client   │ → GitHub, Browser, DB, ...              │   │
│  │  └──────────────┘                                         │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Permission System (stable, no refactor)                  │   │
│  │  Scopes: read-in-cwd, write-out-cwd, network, mcp, ...    │   │
│  │  Modes: allow / deny / ask + autoAccept + planMode        │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

```
User Input → PromptInput → App State Machine → SessionManager.replySession()
                                                      │
                    ┌─────────────────────────────────┘
                    ▼
            ConversationLoop.activate()
                    │
                    ├─→ SkillMatcher.match(prompt) → append skill messages
                    │
                    ├─→ CompactionService.shouldCompact(messages)
                    │       └─→ CompactionService.compact(messages, signal)
                    │
                    ├─→ OpenAIMessageConverter.buildMessages()
                    │       └─→ OpenAI API (streaming)
                    │               └─→ handleAssistantMessage()
                    │                       ├─→ permissions.computeToolCallPermissions()
                    │                       └─→ ToolExecutor.executeToolCalls()
                    │                               └─→ formatToolResult (Observation Design)
                    │
                    └─→ NotificationService.maybeNotify() [on completion]
```

## State Transitions (Session Lifecycle)

```
idle → processing → (success | failed | interrupted | waiting_for_user)
  │        │
  │        └─→ waiting_for_user → processing (after permission reply)
  │
  └─→ processing (on new prompt or /continue)

App View States:
  chat ←→ session-list (via /resume)
  chat ←→ undo (via /undo)
  chat ←→ mcp-status (via /mcp)
```

## Key Interfaces

```typescript
// NEW: SessionStore — extracted from SessionManager
interface ISessionStore {
  createSession(title: string, projectRoot: string): SessionEntry;
  getSession(sessionId: string): SessionEntry | null;
  listSessions(): SessionEntry[];
  deleteSession(sessionId: string): void;
  renameSession(sessionId: string, name: string): void;
  appendMessage(sessionId: string, message: SessionMessage): void;
  listMessages(sessionId: string): SessionMessage[];
  clearMessages(sessionId: string): void;
}

// NEW: ConversationLoop — extracted from SessionManager.activateSession
interface IConversationLoop {
  activate(sessionId: string, options: ConversationLoopOptions): Promise<void>;
}

// NEW: SkillMatcher — extracted LLM-based skill selection
interface ISkillMatcher {
  matchSkills(prompt: string, availableSkills: SkillInfo[]): Promise<string[]>;
}

// NEW: CompactionService — renamed from compacter.ts
interface ICompactionService {
  shouldCompact(messages: SessionMessage[], model: string): CompactionDecision;
  compact(sessionId: string, decision: CompactionDecision, signal: AbortSignal): Promise<void>;
}

// NEW: UndoService — extracted undo/restore/checkpoint logic
interface IUndoService {
  checkpoint(sessionId: string): Promise<FileHistoryCheckpointResult>;
  restore(sessionId: string, target: UndoTarget): Promise<void>;
  getUndoTargets(sessionId: string): UndoTarget[];
}
```

## Contracts

1. **All existing tests must pass after each refactor step.** No behavioral changes.
2. **SessionManager public API is preserved** — new services are internal decomposition.
3. **App.tsx renders identically** — state machine is a refactor of internal state management.
4. **Edit handler behavior is identical** — strategy extraction preserves all matching logic.
5. **No API changes** to tool definitions, settings format, or CLI flags.

---
# File Inventory

## Create

| Path | Purpose |
|------|---------|
| `src/session/SessionStore.ts` | Extracted session CRUD + JSONL persistence |
| `src/session/ConversationLoop.ts` | Extracted LLM ↔ tools conversation loop |
| `src/session/SkillMatcher.ts` | Extracted LLM-based skill matching |
| `src/session/CompactionService.ts` | Renamed compacter with service interface |
| `src/session/UndoService.ts` | Extracted undo/restore/checkpoint logic |
| `src/session/NotificationService.ts` | Extracted notification dispatching |
| `src/session/types.ts` | Shared types: SessionEntry, SessionMessage, LlmStreamProgress, etc. |
| `src/session/index.ts` | Barrel export for session module |
| `src/ui/state/AppStateMachine.ts` | useReducer-based state machine replacing 18 useState calls |
| `src/ui/state/types.ts` | AppState, AppAction types |
| `src/tools/edit-strategies/ExactMatchStrategy.ts` | Exact string matching logic |
| `src/tools/edit-strategies/TabCorrectedMatchStrategy.ts` | Tab-corrected whitespace matching |
| `src/tools/edit-strategies/LooseEscapeMatchStrategy.ts` | Fuzzy escape-tolerant matching |
| `src/tools/edit-strategies/LLMCorrectedMatchStrategy.ts` | LLM-powered correction matching |
| `src/tools/edit-strategies/types.ts` | Edit strategy interfaces |
| `src/ui/components/ErrorBoundary/ErrorBoundary.tsx` | React error boundary for Ink |
| `src/common/i18n.ts` | i18n infrastructure for system prompts |
| `src/common/i18n-strings.ts` | Extracted prompt strings (EN + ZH_CN) |
| `docs/architecture/ADR-001-session-decomposition.md` | ADR: SessionManager split |
| `docs/architecture/ADR-002-state-machine-refactor.md` | ADR: App state machine |
| `docs/architecture/ADR-003-edit-strategy-extraction.md` | ADR: Edit handler strategies |
| `docs/architecture/module-dependency-map.md` | Module dependency diagram |
| `docs/architecture/data-flow.md` | Data flow documentation |
| `src/tests/e2e-smoke.test.ts` | E2E smoke test (mock API) |
| `src/tests/error-boundary.test.ts` | Error boundary unit tests |

## Modify

| Path | Purpose |
|------|---------|
| `src/session.ts` | Reduce to thin delegating facade (~200 lines) |
| `src/session/compacter.ts` | Rename to CompactionService, add interface |
| `src/session/store.ts` | Minor: extract interface |
| `src/ui/views/App.tsx` | Replace 18 useState with useReducer |
| `src/ui/views/AppContainer.tsx` | Wrap with ErrorBoundary |
| `src/tools/edit-handler.ts` | Delegate to strategy classes (~100 lines retained) |
| `src/common/notify.ts` | Wrap in NotificationService interface |
| `src/common/file-history.ts` | Wrap in UndoService interface |
| `src/prompt.ts` | Extract strings to i18n module |

## Test

| Path | Purpose |
|------|---------|
| `src/tests/SessionStore.test.ts` | Test extracted session store |
| `src/tests/ConversationLoop.test.ts` | Test conversation loop isolation |
| `src/tests/SkillMatcher.test.ts` | Test skill matching service |
| `src/tests/CompactionService.test.ts` | Renamed from compacter.test.ts |
| `src/tests/UndoService.test.ts` | Test undo service |
| `src/tests/AppStateMachine.test.ts` | Test state machine transitions |
| `src/tests/edit-strategies.test.ts` | Test individual edit strategies |
| `src/tests/error-boundary.test.ts` | Test error boundary behavior |
| `src/tests/e2e-smoke.test.ts` | Test basic CLI flow with mock API |
| `src/tests/i18n.test.ts` | Test i18n string resolution |

## Docs

| Path | Purpose |
|------|---------|
| `docs/architecture/README.md` | Architecture overview index |
| `docs/architecture/ADR-001-session-decomposition.md` | Decision record for session split |
| `docs/architecture/ADR-002-state-machine-refactor.md` | Decision record for App refactor |
| `docs/architecture/ADR-003-edit-strategy-extraction.md` | Decision record for edit refactor |
| `docs/architecture/module-dependency-map.md` | Visual dependency graph |
| `docs/architecture/data-flow.md` | Data flow diagrams and descriptions |

---
# Risk Register

## Regression Risks

| Risk | Likelihood | Severity | Mitigation | Detection |
|------|-----------|----------|------------|-----------|
| SessionManager split breaks conversation flow | Medium | Critical | Preserve public API, run all 466+ tests after each split | `npm test` after each task |
| App.tsx state machine breaks UI behavior | Medium | High | Keep all components unchanged, only refactor state management | Run all UI tests + manual smoke test |
| Edit handler strategy extraction changes matching logic | Low | High | Extract strategies one at a time, validate with existing test cases | `tool-handlers.test.ts` |
| Compaction service rename breaks imports | Low | Medium | Use barrel exports, update all imports atomically | Typecheck after each file change |
| i18n extraction changes prompt content | Medium | Medium | Extract strings as-is, no translation changes in this phase | Diff old vs new prompt output |

## Data Loss Risks

| Risk | Likelihood | Severity | Mitigation | Detection |
|------|-----------|----------|------------|-----------|
| SessionStore refactor loses messages | Very Low | Critical | Git file history provides rollback; tests verify persistence | Session store integration tests |
| Undo service refactor corrupts checkpoints | Very Low | High | Git bare repo checkpoints are append-only; refactor is wrapper | File history tests |

## Concurrency Risks

| Risk | Likelihood | Severity | Mitigation | Detection |
|------|-----------|----------|------------|-----------|
| Parallel bash processes during refactor | Very Low | Low | No changes to process management code | Existing bash handler tests |
| MCP multi-server concurrency | Very Low | Low | No changes to MCP code | Existing MCP tests |

## Permission Risks

| Risk | Likelihood | Severity | Mitigation | Detection |
|------|-----------|----------|------------|-----------|
| Permission system affected by state machine refactor | Very Low | High | Permission system is unchanged; only wiring in App.tsx changes | All permissions tests |
| AutoAccept/planMode flags wiring | Low | Medium | Flags remain in SessionManagerOptions, pass through same path | `plan-mode-auto-accept` tests |

## Security Risks

| Risk | Likelihood | Severity | Mitigation | Detection |
|------|-----------|----------|------------|-----------|
| API key exposure during refactor | Very Low | Critical | No logging changes; key masking unchanged | Manual review |
| Path traversal in new service interfaces | Very Low | High | Validate all file paths, reuse existing validation | Path validation tests |

## Performance Risks

| Risk | Likelihood | Severity | Mitigation | Detection |
|------|-----------|----------|------------|-----------|
| State machine overhead vs direct useState | Very Low | Low | useReducer is React-native, no extra library overhead | Performance benchmark comparison |
| Service abstraction overhead | Very Low | Low | New services are pure refactors, no extra allocations | Run test suite timing comparison |

## Migration Risks

| Risk | Likelihood | Severity | Mitigation | Detection |
|------|-----------|----------|------------|-----------|
| Import path changes break downstream consumers | Low | Medium | Barrel exports (`index.ts`), keep old paths as re-exports | `npm run build` after all changes |
| Test file import changes | Low | Low | Update test imports in same commit as source changes | `npm test` in CI |

## Context Window Risks

| Risk | Likelihood | Severity | Mitigation | Detection |
|------|-----------|----------|------------|-----------|
| Plan too large for agent context | High | Medium | Split into 4 independent subsystems, each executable independently | Per-subsystem checkpoints |

## Agent Execution Risks

| Risk | Likelihood | Severity | Mitigation | Detection |
|------|-----------|----------|------------|-----------|
| Parallel agents conflict on shared files | Medium | Low | Each subsystem touches different files; subsystem A must complete before B | File inventory clearly partitions ownership |
| Agent skips commit requirement | Medium | Medium | Every task ends with commit; CI gates on clean tree | Pre-commit hooks |

---

# Test Architecture

## Unit Tests

| Test | Files | Command | Expected |
|------|-------|---------|----------|
| SessionStore CRUD | `src/tests/SessionStore.test.ts` | `npx tsx --test src/tests/SessionStore.test.ts` | All CRUD operations pass |
| ConversationLoop isolation | `src/tests/ConversationLoop.test.ts` | `npx tsx --test src/tests/ConversationLoop.test.ts` | Loop logic passes |
| SkillMatcher matching | `src/tests/SkillMatcher.test.ts` | `npx tsx --test src/tests/SkillMatcher.test.ts` | Skill matching correct |
| AppStateMachine transitions | `src/tests/AppStateMachine.test.ts` | `npx tsx --test src/tests/AppStateMachine.test.ts` | All state transitions valid |
| Edit strategies (4 strategies) | `src/tests/edit-strategies.test.ts` | `npx tsx --test src/tests/edit-strategies.test.ts` | Each strategy matches correctly |
| ErrorBoundary catch | `src/tests/error-boundary.test.ts` | `npx tsx --test src/tests/error-boundary.test.ts` | Errors caught, UI rendered |
| i18n string resolution | `src/tests/i18n.test.ts` | `npx tsx --test src/tests/i18n.test.ts` | Strings resolve correctly |

## Integration Tests (Existing)

| Test | Files | Command | Expected |
|------|-------|---------|----------|
| All existing 33 test files | `src/tests/*.test.ts` | `npm test` | All 466+ tests pass |
| SessionManager facade | `src/tests/session.test.ts` | `npm test` | All existing session tests pass |

## End-to-End Tests

| Test | Files | Command | Expected |
|------|-------|---------|----------|
| Basic CLI flow | `src/tests/e2e-smoke.test.ts` | `npx tsx --test src/tests/e2e-smoke.test.ts` | CLI starts, processes prompt, returns result |
| AutoAccept headless mode | `src/tests/e2e-smoke.test.ts` | Same file | Headless mode completes without user input |
| Plan mode approval | `src/tests/e2e-smoke.test.ts` | Same file | Plan mode pauses for each tool call |

## Regression Tests

| Test | Files | Command | Expected |
|------|-------|---------|----------|
| Full test suite | All test files | `npm test` | Zero failures |
| Typecheck | All source files | `npm run typecheck` | No errors |
| Lint | All source files | `npm run lint` | No errors |
| Format check | All source files | `npm run format:check` | No violations |

## Failure Tests (Existing)

| Test | Files | Command | Expected |
|------|-------|---------|----------|
| API key missing | SessionManager tests | `npm test` | Graceful error message |
| MCP server down | MCP tests | `npm test` | Error handled, CLI continues |
| Invalid model name | Settings tests | `npm test` | Fallback to default |
| Corrupted session file | Store tests | `npm test` | Session recovery or clean failure |

## Smoke Tests

| Test | Files | Command | Expected |
|------|-------|---------|----------|
| CLI help | CLI | `npx tsx src/cli.tsx --help` | Help output displayed |
| CLI version | CLI | `npx tsx src/cli.tsx --version` | Version number output |
| Build succeeds | Build | `npm run build` | `dist/cli.js` created |
| Binary executable | Build | `node dist/cli.js --help` | Help output via binary |

---
# Verification Pipeline

For every task in this plan, the verification sequence is:

1. **Code Verification:** Review diff before commit, ensure no accidental changes
2. **Type Verification:** `npm run typecheck` — must pass with no errors
3. **Lint Verification:** `npm run lint` — must pass with no warnings
4. **Test Verification:** `npm test` — all 466+ tests must pass
5. **Integration Verification:** `npm run build` — dist/cli.js must compile
6. **Manual Verification:** `npx tsx src/cli.tsx` — interactive smoke test for UI-related tasks

---

# Subagent Plan

## Subsystem Dependencies

```
Subsystem C (Edit Strategies) ──► Independent, can run first
Subsystem D (Infrastructure)  ──► Independent, can run in parallel with C
Subsystem A (Session Decomp)  ──► Must complete before B (App changes depend on new interfaces)
Subsystem B (App State Machine)──► Depends on A (uses new SessionManager facade)
```

## Agent Assignments

### Agent 1: Edit Handler Strategy Extraction (Subsystem C)

**Responsibility:** Decompose `edit-handler.ts` (867 lines) into 4 strategy classes.

**Inputs:** `src/tools/edit-handler.ts`

**Outputs:**
- `src/tools/edit-strategies/types.ts`
- `src/tools/edit-strategies/ExactMatchStrategy.ts`
- `src/tools/edit-strategies/TabCorrectedMatchStrategy.ts`
- `src/tools/edit-strategies/LooseEscapeMatchStrategy.ts`
- `src/tools/edit-strategies/LLMCorrectedMatchStrategy.ts`
- Modified: `src/tools/edit-handler.ts` (reduced to ~100 lines)
- New: `src/tests/edit-strategies.test.ts`

**Merge Point:** All files committed to same branch, no conflicts with other agents.

### Agent 2: Infrastructure Hardening (Subsystem D)

**Responsibility:** Add ErrorBoundary, architecture docs, E2E tests, i18n infrastructure.

**Inputs:** Current state of all files.

**Outputs:**
- `src/ui/components/ErrorBoundary/ErrorBoundary.tsx`
- Modified: `src/ui/views/AppContainer.tsx`
- `src/common/i18n.ts`
- `src/common/i18n-strings.ts`
- Modified: `src/prompt.ts`
- `src/tests/error-boundary.test.ts`
- `src/tests/e2e-smoke.test.ts`
- `src/tests/i18n.test.ts`
- `docs/architecture/` (all ADRs and diagrams)

**Merge Point:** No file conflicts with Agent 1. May have minor merge with Agent 3 on `src/prompt.ts`.

### Agent 3: SessionManager Decomposition (Subsystem A)

**Responsibility:** Split `session.ts` (2834 lines) into 6 focused service files.

**Inputs:** `src/session.ts`, `src/session/compacter.ts`, `src/session/store.ts`

**Outputs:**
- `src/session/types.ts`
- `src/session/SessionStore.ts`
- `src/session/ConversationLoop.ts`
- `src/session/SkillMatcher.ts`
- `src/session/CompactionService.ts` (renamed from compacter.ts)
- `src/session/UndoService.ts`
- `src/session/NotificationService.ts`
- `src/session/index.ts` (barrel export)
- Modified: `src/session.ts` (thin facade ~200 lines)
- Modified: `src/session/store.ts` (add interface)
- Deleted: `src/session/compacter.ts` (renamed)
- New: `src/tests/SessionStore.test.ts`, `src/tests/ConversationLoop.test.ts`, etc.
- Updated: `src/tests/compacter.test.ts` → `src/tests/CompactionService.test.ts`

**Merge Point:** Must complete before Agent 4 starts. All imports in App.tsx point to `src/session/index.ts`.

### Agent 4: App State Machine Refactor (Subsystem B)

**Responsibility:** Refactor `App.tsx` (881 lines) to use useReducer state machine.

**Inputs:** Modified `src/session/index.ts` (barrel from Agent 3), `src/ui/views/App.tsx`

**Outputs:**
- `src/ui/state/types.ts`
- `src/ui/state/AppStateMachine.ts`
- Modified: `src/ui/views/App.tsx` (reduced to ~400 lines)
- New: `src/tests/AppStateMachine.test.ts`

**Merge Point:** No file conflicts with other agents. Updates App.tsx imports to use new session barrel.

---

# Task Generation

## PHASE C: Edit Handler Strategy Extraction (Agent 1)

### Task C1: Create Edit Strategy Types

**Files:** Create: `src/tools/edit-strategies/types.ts`

**Purpose:** Define the strategy interface that all edit matching strategies implement.

- [ ] **Step 1: Create types file**

```typescript
// src/tools/edit-strategies/types.ts
export type LineIndex = {
  lines: string[];
  lineStarts: number[];
};

export type SearchScope = {
  filePath: string;
  startOffset: number;
  endOffset: number;
  startLine: number;
  endLine: number;
  snippetId: string | null;
};

export type MatchOccurrence = {
  startOffset: number;
  endOffset: number;
  startLine: number;
  endLine: number;
};

export type MatchResult = {
  found: boolean;
  occurrences: MatchOccurrence[];
  error?: string;
};

export interface EditStrategy {
  readonly name: string;
  match(params: {
    oldString: string;
    content: string;
    scope: SearchScope;
    lineIndex: LineIndex;
    replaceAll: boolean;
    expectedOccurrences?: number;
  }): MatchResult;
}
```

- [ ] **Step 2: Typecheck** — Run: `npm run typecheck` Expected: PASS
- [ ] **Step 3: Commit**

```bash
git add src/tools/edit-strategies/types.ts
git commit -m "refactor(edit): define edit strategy interface types"
```

---

### Task C2: Extract ExactMatchStrategy

**Files:** Create: `src/tools/edit-strategies/ExactMatchStrategy.ts`, Test: `src/tests/edit-strategies.test.ts`

**Purpose:** Extract exact string matching logic from edit-handler into a dedicated strategy class.

- [ ] **Step 1: Write failing test**

```typescript
// src/tests/edit-strategies.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ExactMatchStrategy } from "../tools/edit-strategies/ExactMatchStrategy";

describe("ExactMatchStrategy", () => {
  it("finds a single exact occurrence", () => {
    const strategy = new ExactMatchStrategy();
    const result = strategy.match({
      oldString: "hello",
      content: "hello world",
      scope: { filePath: "/test/file.txt", startOffset: 0, endOffset: 11, startLine: 1, endLine: 1, snippetId: null },
      lineIndex: { lines: ["hello world"], lineStarts: [0] },
      replaceAll: false, expectedOccurrences: 1,
    });
    assert.equal(result.found, true);
    assert.equal(result.occurrences.length, 1);
  });

  it("returns error when no match found", () => {
    const strategy = new ExactMatchStrategy();
    const result = strategy.match({
      oldString: "xyz",
      content: "hello world",
      scope: { filePath: "/test/file.txt", startOffset: 0, endOffset: 11, startLine: 1, endLine: 1, snippetId: null },
      lineIndex: { lines: ["hello world"], lineStarts: [0] },
      replaceAll: false,
    });
    assert.equal(result.found, false);
    assert.ok(result.error);
  });

  it("finds multiple occurrences with replace_all", () => {
    const strategy = new ExactMatchStrategy();
    const result = strategy.match({
      oldString: "hi",
      content: "hi there, hi again",
      scope: { filePath: "/test/file.txt", startOffset: 0, endOffset: 18, startLine: 1, endLine: 1, snippetId: null },
      lineIndex: { lines: ["hi there, hi again"], lineStarts: [0] },
      replaceAll: true,
    });
    assert.equal(result.found, true);
    assert.equal(result.occurrences.length, 2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npx tsx --test src/tests/edit-strategies.test.ts` Expected: FAIL

- [ ] **Step 3: Implement ExactMatchStrategy**

```typescript
// src/tools/edit-strategies/ExactMatchStrategy.ts
import type { EditStrategy, LineIndex, MatchResult, SearchScope } from "./types";

const REPLACE_ALL_MATCH_THRESHOLD = 5;

export class ExactMatchStrategy implements EditStrategy {
  readonly name = "exact";

  match(params: {
    oldString: string; content: string; scope: SearchScope;
    lineIndex: LineIndex; replaceAll: boolean; expectedOccurrences?: number;
  }): MatchResult {
    const { oldString, content, scope, lineIndex, replaceAll, expectedOccurrences } = params;
    if (!oldString) return { found: false, occurrences: [], error: "old_string is empty" };

    const searchContent = content.slice(scope.startOffset, scope.endOffset);
    const occurrences: Array<{ startOffset: number; endOffset: number; startLine: number; endLine: number }> = [];
    let searchFrom = 0;

    while (searchFrom < searchContent.length) {
      const idx = searchContent.indexOf(oldString, searchFrom);
      if (idx === -1) break;
      const absOffset = scope.startOffset + idx;
      occurrences.push({
        startOffset: absOffset, endOffset: absOffset + oldString.length,
        startLine: this.findLine(absOffset, lineIndex),
        endLine: this.findLine(absOffset + oldString.length, lineIndex),
      });
      searchFrom = idx + oldString.length;
      if (!replaceAll) break;
    }

    if (occurrences.length === 0) return { found: false, occurrences: [], error: "old_string was not found in the file content." };
    if (replaceAll && occurrences.length > REPLACE_ALL_MATCH_THRESHOLD)
      return { found: false, occurrences: [], error: `replace_all matched ${occurrences.length} occurrences (>${REPLACE_ALL_MATCH_THRESHOLD}). Provide a more specific old_string.` };
    if (expectedOccurrences && occurrences.length !== expectedOccurrences)
      return { found: false, occurrences: [], error: `Expected ${expectedOccurrences} occurrences but found ${occurrences.length}.` };

    return { found: true, occurrences };
  }

  private findLine(offset: number, lineIndex: LineIndex): number {
    for (let i = lineIndex.lineStarts.length - 1; i >= 0; i--) if (offset >= lineIndex.lineStarts[i]) return i + 1;
    return 1;
  }
}
```

- [ ] **Step 4: Run test to verify it passes** — Run: `npx tsx --test src/tests/edit-strategies.test.ts` Expected: PASS
- [ ] **Step 5: Typecheck and lint** — Run: `npm run typecheck && npm run lint` Expected: PASS
- [ ] **Step 6: Commit**

```bash
git add src/tools/edit-strategies/ExactMatchStrategy.ts src/tests/edit-strategies.test.ts
git commit -m "refactor(edit): extract ExactMatchStrategy from edit-handler"
```

---

### Task C3-C5: Extract Remaining Strategies

Following the same pattern (failing test → implementation → passing test → commit):

- **Task C3:** `TabCorrectedMatchStrategy` — tab/space normalization matching
- **Task C4:** `LooseEscapeMatchStrategy` — fuzzy escape-tolerant matching
- **Task C5:** `LLMCorrectedMatchStrategy` — LLM-powered correction matching

Each follows TDD: write test, verify fail, implement, verify pass, typecheck, lint, commit.

---

### Task C6: Refactor edit-handler.ts to Use Strategies

**Files:** Modify: `src/tools/edit-handler.ts`

**Purpose:** Replace inline matching logic with strategy chain delegation.

- [ ] **Step 1: Run existing tests as baseline** — Run: `npx tsx --test src/tests/tool-handlers.test.ts`
- [ ] **Step 2: Refactor edit-handler.ts** — Replace 700+ lines with strategy chain delegation
- [ ] **Step 3: Run tests to verify no regression** — Run: `npx tsx --test src/tests/tool-handlers.test.ts`
- [ ] **Step 4: Typecheck and lint** — Run: `npm run typecheck && npm run lint`
- [ ] **Step 5: Commit**

```bash
git add src/tools/edit-handler.ts
git commit -m "refactor(edit): delegate matching to strategy chain in edit-handler"
```

---

### Checkpoint C: Edit Strategy Extraction Complete

**Verification:** `npm test && npm run typecheck` — All tests pass, no errors.

---

## PHASE D: Infrastructure Hardening (Agent 2)

### Task D1: Add ErrorBoundary Component

**Files:** Create: `src/ui/components/ErrorBoundary/ErrorBoundary.tsx`, Modify: `src/ui/views/AppContainer.tsx`, Test: `src/tests/error-boundary.test.ts`

**Purpose:** Prevent terminal crash from uncaught React errors.

- [ ] **Step 1: Write failing test** — `error-boundary.test.ts`
- [ ] **Step 2: Implement ErrorBoundary** — catches render errors, displays fallback UI
- [ ] **Step 3: Wrap AppContainer** — wrap App component with ErrorBoundary
- [ ] **Step 4: Run tests, typecheck, lint, commit**

```bash
git add src/ui/components/ErrorBoundary/ErrorBoundary.tsx src/ui/views/AppContainer.tsx src/tests/error-boundary.test.ts
git commit -m "feat(ui): add ErrorBoundary to prevent terminal crash on React errors"
```

---

### Task D2: Create Architecture Documentation

**Files:** Create: `docs/architecture/README.md`, 3 ADR files, module-dependency-map.md, data-flow.md

**Purpose:** Document architecture decisions, module dependencies, and data flows.

- [ ] **Step 1: Create architecture README**
- [ ] **Step 2: Write ADR-001** (SessionManager decomposition rationale)
- [ ] **Step 3: Write ADR-002** (App state machine rationale)
- [ ] **Step 4: Write ADR-003** (Edit strategy rationale)
- [ ] **Step 5: Create module dependency map**
- [ ] **Step 6: Create data flow documentation**
- [ ] **Step 7: Commit**

```bash
git add docs/architecture/
git commit -m "docs: add architecture decision records and dependency maps"
```

---

### Task D3: Implement i18n Infrastructure

**Files:** Create: `src/common/i18n.ts`, `src/common/i18n-strings.ts`, Modify: `src/prompt.ts`, Test: `src/tests/i18n.test.ts`

**Purpose:** Extract hardcoded Chinese system prompt strings into an i18n system.

- [ ] **Step 1: Write failing test** — `i18n.test.ts` verifies string resolution
- [ ] **Step 2: Implement i18n module** — `i18n.ts` with getString(), setLocale()
- [ ] **Step 3: Create i18n strings** — EN_STRINGS and ZH_CN_STRINGS
- [ ] **Step 4: Update prompt.ts** — replace hardcoded strings with getString() calls
- [ ] **Step 5: Run all tests, typecheck, lint, commit**

```bash
git add src/common/i18n.ts src/common/i18n-strings.ts src/prompt.ts src/tests/i18n.test.ts
git commit -m "feat(i18n): extract prompt strings into i18n infrastructure"
```

---

### Task D4: Add E2E Smoke Tests

**Files:** Create: `src/tests/e2e-smoke.test.ts`

**Purpose:** Verify basic CLI flow works end-to-end.

- [ ] **Step 1: Write E2E smoke test** — CLI help, version, basic flag parsing
- [ ] **Step 2: Build dist/cli.js** — Run: `npm run build`
- [ ] **Step 3: Run E2E tests** — Run: `npx tsx --test src/tests/e2e-smoke.test.ts` Expected: PASS
- [ ] **Step 4: Commit**

```bash
git add src/tests/e2e-smoke.test.ts
git commit -m "test(e2e): add basic CLI smoke tests"
```

---

### Checkpoint D: Infrastructure Complete

**Verification:** `npm test && npm run typecheck && npm run build` — All pass.

---
## PHASE A: SessionManager Decomposition (Agent 3)

### Task A1: Extract Session Types

**Files:** Create: `src/session/types.ts`, Modify: `src/session.ts`

**Purpose:** Move all type/interface definitions from session.ts to a dedicated types file.

- [ ] **Step 1: Create types.ts** — Extract: SessionEntry, SessionMessage, LlmStreamProgress, SkillInfo, UndoTarget, UserPromptContent, SessionStatus, MessageMeta, SessionManagerOptions
- [ ] **Step 2: Update session.ts imports** — Import types from new file
- [ ] **Step 3: Run tests to verify no breakage** — `npm test && npm run typecheck`
- [ ] **Step 4: Commit**

```bash
git add src/session/types.ts src/session.ts
git commit -m "refactor(session): extract type definitions to session/types.ts"
```

---

### Task A2: Extract SessionStore Service

**Files:** Create: `src/session/SessionStore.ts`, Modify: `src/session/store.ts`, Modify: `src/session.ts`, Test: `src/tests/SessionStore.test.ts`

**Purpose:** Extract session CRUD and JSONL persistence from SessionManager into SessionStore.

- [ ] **Step 1: Write SessionStore tests** — CRUD operations, JSONL read/write
- [ ] **Step 2: Implement SessionStore** — Move createSession, getSession, listSessions, deleteSession, renameSession, appendSessionMessage, listSessionMessages, clearSessionMessages
- [ ] **Step 3: Update SessionManager to delegate** — Replace direct calls with this.sessionStore.xxx()
- [ ] **Step 4: Run all tests, commit**

```bash
git add src/session/SessionStore.ts src/session/store.ts src/session.ts src/tests/SessionStore.test.ts
git commit -m "refactor(session): extract SessionStore from SessionManager"
```

---

### Task A3: Extract ConversationLoop

**Files:** Create: `src/session/ConversationLoop.ts`, Modify: `src/session.ts`, Test: `src/tests/ConversationLoop.test.ts`

**Purpose:** Extract the LLM → tools → LLM conversation loop from activateSession.

- [ ] **Step 1: Write conversation loop tests** — mock OpenAI client, verify iteration loop
- [ ] **Step 2: Implement ConversationLoop** — Extract activateSession's for-loop logic
- [ ] **Step 3: Update SessionManager** — activateSession delegates to ConversationLoop
- [ ] **Step 4: Run all tests, commit**

```bash
git add src/session/ConversationLoop.ts src/session.ts src/tests/ConversationLoop.test.ts
git commit -m "refactor(session): extract ConversationLoop from SessionManager"
```

---

### Task A4: Extract SkillMatcher

**Files:** Create: `src/session/SkillMatcher.ts`, Modify: `src/session.ts`, Test: `src/tests/SkillMatcher.test.ts`

**Purpose:** Extract LLM-based skill matching into a dedicated service.

- [ ] **Step 1: Write SkillMatcher tests**
- [ ] **Step 2: Implement SkillMatcher**
- [ ] **Step 3: Wire into SessionManager**
- [ ] **Step 4: Run all tests, commit**

```bash
git add src/session/SkillMatcher.ts src/session.ts src/tests/SkillMatcher.test.ts
git commit -m "refactor(session): extract SkillMatcher from SessionManager"
```

---

### Task A5: Extract CompactionService

**Files:** Create: `src/session/CompactionService.ts`, Delete: `src/session/compacter.ts`, Modify: `src/session.ts`, Rename: `src/tests/compacter.test.ts` → `src/tests/CompactionService.test.ts`

**Purpose:** Rename and wrap compaction logic as a proper service.

- [ ] **Step 1: Implement CompactionService** — migrate from compacter.ts, add service interface
- [ ] **Step 2: Update imports in all files** — session.ts, tests
- [ ] **Step 3: Run all tests, commit**

```bash
git add src/session/CompactionService.ts src/session.ts src/tests/CompactionService.test.ts
git rm src/session/compacter.ts src/tests/compacter.test.ts
git commit -m "refactor(session): rename compacter to CompactionService"
```

---

### Task A6: Extract UndoService and NotificationService

**Files:** Create: `src/session/UndoService.ts`, Create: `src/session/NotificationService.ts`, Modify: `src/session.ts`, Test: `src/tests/UndoService.test.ts`

**Purpose:** Extract undo/restore and notification logic into dedicated services.

- [ ] **Step 1: Implement UndoService** — wraps GitFileHistory + undo logic
- [ ] **Step 2: Implement NotificationService** — wraps notify + telemetry
- [ ] **Step 3: Wire into SessionManager**
- [ ] **Step 4: Run all tests, commit**

```bash
git add src/session/UndoService.ts src/session/NotificationService.ts src/session.ts src/tests/UndoService.test.ts
git commit -m "refactor(session): extract UndoService and NotificationService"
```

---

### Task A7: Create Session Barrel Export

**Files:** Create: `src/session/index.ts`, Modify: `src/session.ts`, Modify: `src/ui/views/App.tsx`

**Purpose:** Create barrel export and reduce SessionManager to a thin facade.

- [ ] **Step 1: Create barrel export** — re-export all session services and types
- [ ] **Step 2: Reduce session.ts to ~200 line facade**
- [ ] **Step 3: Update App.tsx imports** — import from session barrel
- [ ] **Step 4: Run full test suite, typecheck, lint, build, commit**

```bash
npm test && npm run typecheck && npm run lint && npm run build
git add src/session/index.ts src/session.ts src/ui/views/App.tsx
git commit -m "refactor(session): create barrel export, reduce SessionManager to facade"
```

---

### Checkpoint A: Session Decomposition Complete

**Expected State:** `src/session.ts`: 2834 → ~200 lines. 7 new service files in `src/session/`. All 466+ tests pass.

**Verification:** `npm test && npm run typecheck && npm run build` — All pass.

---

## PHASE B: App State Machine Refactor (Agent 4)

### Task B1: Create App State Types

**Files:** Create: `src/ui/state/types.ts`

**Purpose:** Define AppState and AppAction types for the state machine.

- [ ] **Step 1: Create types file** — AppState (20 fields), AppAction (20 action types)
- [ ] **Step 2: Typecheck and commit**

```bash
git add src/ui/state/types.ts
git commit -m "refactor(ui): define AppState and AppAction types for state machine"
```

---

### Task B2: Implement AppStateMachine

**Files:** Create: `src/ui/state/AppStateMachine.ts`, Test: `src/tests/AppStateMachine.test.ts`

**Purpose:** Implement useReducer-based state machine replacing 18 useState calls.

- [ ] **Step 1: Write state machine tests** — SET_VIEW, ADD_MESSAGE, SET_BUSY actions
- [ ] **Step 2: Run test to verify fail** — AppStateMachine not found
- [ ] **Step 3: Implement reducer** — appReducer with 20 case branches
- [ ] **Step 4: Run test to verify pass** — All transitions work
- [ ] **Step 5: Commit**

```bash
git add src/ui/state/AppStateMachine.ts src/tests/AppStateMachine.test.ts
git commit -m "refactor(ui): implement AppStateMachine reducer"
```

---

### Task B3: Refactor App.tsx to Use useReducer

**Files:** Modify: `src/ui/views/App.tsx`

**Purpose:** Replace 18 useState calls with single useReducer + dispatch.

- [ ] **Step 1: Capture existing behavior** — run all tests as baseline
- [ ] **Step 2: Replace useState with useReducer** — dispatch-based state management
- [ ] **Step 3: Run all tests to verify no regression** — all 466+ tests PASS
- [ ] **Step 4: Run manual smoke test** — `npx tsx src/cli.tsx` verify UI works
- [ ] **Step 5: Typecheck, lint, commit**

```bash
git add src/ui/views/App.tsx
git commit -m "refactor(ui): replace 18 useState with useReducer state machine"
```

---

### Checkpoint B: App Refactor Complete

**Expected State:** App.tsx reduced from 881 to ~400 lines, centralized state machine.

**Verification:** `npm test && npm run typecheck && npm run build` — All pass.

---

# Checkpoints

## Checkpoint 1: After Edit Strategy Extraction (Tasks C1-C6)
```bash
npm test                    # All 466+ pass
npm run typecheck           # Clean
```

## Checkpoint 2: After Infrastructure (Tasks D1-D4)
```bash
npm test                    # All +E2E +i18n +ErrorBoundary pass
npm run build               # dist/cli.js exists
node dist/cli.js --help     # Works
```

## Checkpoint 3: After Session Decomposition (Tasks A1-A7)
```bash
npm test                    # All pass, session.ts now ~200 lines
npm run typecheck           # Clean
npm run build               # Succeeds
```

## Checkpoint 4: After App Refactor (Tasks B1-B3)
```bash
npm test                    # All pass, App.tsx uses useReducer
npm run typecheck           # Clean
npm run build               # Succeeds
```

## Final Checkpoint
```bash
npm test                    # All 500+ tests pass (including new ones)
npm run typecheck           # No errors
npm run lint                # No violations
npm run format:check        # No format violations
npm run build               # Build succeeds
node dist/cli.js --help     # Help displayed
node dist/cli.js --version  # Version displayed
```

---

# Rollback Plan

## Phase C (Edit Strategies) Rollback
```bash
git checkout -- src/tools/edit-handler.ts
rm -rf src/tools/edit-strategies/
rm src/tests/edit-strategies.test.ts
```

## Phase D (Infrastructure) Rollback
```bash
git checkout -- src/ui/views/AppContainer.tsx src/prompt.ts
rm -rf src/ui/components/ErrorBoundary/
rm src/common/i18n.ts src/common/i18n-strings.ts
rm src/tests/error-boundary.test.ts src/tests/e2e-smoke.test.ts src/tests/i18n.test.ts
rm -rf docs/architecture/
```

## Phase A (Session Decomposition) Rollback
```bash
git checkout -- src/session.ts src/session/store.ts src/session/compacter.ts
git checkout -- src/tests/compacter.test.ts
rm -rf src/session/types.ts src/session/SessionStore.ts src/session/ConversationLoop.ts
rm -rf src/session/SkillMatcher.ts src/session/CompactionService.ts
rm -rf src/session/UndoService.ts src/session/NotificationService.ts
rm src/session/index.ts
rm src/tests/SessionStore.test.ts src/tests/ConversationLoop.test.ts
rm src/tests/SkillMatcher.test.ts src/tests/CompactionService.test.ts
rm src/tests/UndoService.test.ts
```

## Phase B (App State Machine) Rollback
```bash
git checkout -- src/ui/views/App.tsx
rm -rf src/ui/state/
rm src/tests/AppStateMachine.test.ts
```

## Full Reset
```bash
git reset --hard HEAD~15  # Or specific commit before refactor
```

---

# Documentation

## Generated in Task D2:
1. `docs/architecture/README.md` — Architecture overview index
2. `docs/architecture/ADR-001-session-decomposition.md` — Why we split SessionManager
3. `docs/architecture/ADR-002-state-machine-refactor.md` — Why we use useReducer
4. `docs/architecture/ADR-003-edit-strategy-extraction.md` — Why we use Strategy Pattern
5. `docs/architecture/module-dependency-map.md` — Visual dependency graph
6. `docs/architecture/data-flow.md` — Data flow documentation

## Existing Documentation Preserved:
- `docs/configuration.md` (EN + ZH)
- `docs/mcp.md` (EN + ZH)
- `docs/permission.md` (EN + ZH)
- `docs/session.md` (EN + ZH)
- `docs/skills.md` (EN + ZH)
- `docs/agents.md` (EN + ZH)
- `docs/quickstart.md` (EN + ZH)
- `docs/notify.md` (EN + ZH)
- `README.md`, `README-en.md`, `README-zh_CN.md`

---

# Self Audit

## Coverage Audit

| Requirement | Task |
|-------------|------|
| Split SessionManager God Object | Tasks A1-A7 |
| Reduce session.ts from 2834 to ~200 lines | Task A7 |
| Extract 5 focused services (Store, Loop, Skill, Compact, Undo, Notify) | Tasks A2-A6 |
| Create barrel export | Task A7 |
| Refactor App.tsx with state machine | Tasks B1-B3 |
| Reduce App.tsx from 881 to ~400 lines | Task B3 |
| Add ErrorBoundary | Task D1 |
| Decompose edit-handler.ts | Tasks C1-C6 |
| Extract 4 edit strategies | Tasks C1-C5 |
| Refactor edit-handler to delegate | Task C6 |
| Create architecture docs (ADRs) | Task D2 |
| Add i18n infrastructure | Task D3 |
| Add E2E smoke tests | Task D4 |
| Preserve all existing functionality | All tasks (verified by existing tests) |
| Zero test regression | Every task includes `npm test` step |

## Dependency Audit

```
C1 → C2 → C3 → C4 → C5 → C6  (sequential within edit strategy phase)
D1, D2, D3, D4                  (parallel within infrastructure phase)
A1 → A2 → A3 → A4 → A5 → A6 → A7  (sequential within session phase)
B1 → B2 → B3                    (sequential within app phase)
C ∥ D (parallel phases)
D before A (no dependency, but D files are disjoint)
A before B (App depends on session barrel)
```

## Naming Audit

| Pattern | Consistency |
|---------|-------------|
| Service files: `XxxService.ts` or `XxxStore.ts` | ✓ Consistent |
| Test files: `${ServiceName}.test.ts` | ✓ Consistent |
| Strategy files: `XxxStrategy.ts` | ✓ Consistent |
| Types files: `types.ts` in each module | ✓ Consistent |
| Barrel: `index.ts` at module root | ✓ Consistent |
| Docs: `ADR-NNN-description.md` | ✓ Consistent |

## File Audit

All files referenced in tasks have been verified:
- All "Create" files are new (not in existing repo)
- All "Modify" files exist at specified paths
- All "Test" files are either new or existing tests
- No file is referenced in multiple overlapping agent scopes

## Test Audit

| Behavior | Test Coverage |
|----------|--------------|
| Session CRUD | `SessionStore.test.ts` + existing `store.test.ts` |
| Conversation loop | `ConversationLoop.test.ts` + existing `session.test.ts` |
| Skill matching | `SkillMatcher.test.ts` + existing `session.test.ts` |
| Compaction | `CompactionService.test.ts` (renamed from compacter.test.ts) |
| Undo/Restore | `UndoService.test.ts` + existing file-history tests |
| State machine transitions | `AppStateMachine.test.ts` |
| Edit matching strategies | `edit-strategies.test.ts` |
| Error boundary | `error-boundary.test.ts` |
| i18n strings | `i18n.test.ts` |
| E2E smoke | `e2e-smoke.test.ts` |
| Regression (full suite) | All 466+ existing tests preserved |

## Risk Audit

| Risk | Mitigation | Verified By |
|------|-----------|-------------|
| Regression on conversation flow | Preserving public API, running existing tests | `npm test` after each task |
| UI behavior change | State machine is internal refactor, components unchanged | Manual smoke test + existing UI tests |
| Edit matching logic change | Strategies extracted verbatim from handler | Tool handler test comparison |
| Import path breakage | Barrel exports, updated imports in same commit | `npm run typecheck` + `npm run build` |
| Agent execution errors | Small tasks (2-5 min), frequent commits | Task granularity enforced |

---

Plan complete and saved to:

`docs/superpowers/plans/2026-06-13-master-architecture-refactor.md`

Execution modes available:

1. **Subagent-Driven Development** — Dispatch 4 parallel agents (C ∥ D, then A, then B)
2. **Parallel Worktree Execution** — Use git worktrees for Phases C and D in parallel
3. **Inline Sequential Execution** — Execute all tasks in order (C → D → A → B)
4. **Verification-First Execution** — Run full test suite before and after each phase
