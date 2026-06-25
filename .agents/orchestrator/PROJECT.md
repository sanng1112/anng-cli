# Project: anng-cli Codebase Audit

## Architecture
- `src/session/`: Handles user chat sessions, compaction of context window, API key rotation, token counting, cost tracking, and connection to OpenAI/deepseek.
- `src/ui/`: Command-line user interface implemented using Ink/React, handles layout, interactive dropdowns, input hooks, and terminal rendering.
- `src/prompt-engine/`: Manages templates and prompt assembly, including system messages, tools descriptions, and user inputs.
- `src/tools/`: Interactive tool handlers (bash execution, reading/writing files, edit patches, web search) which are called by the LLM agent.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1: Codebase Review | Search & analyze src/session, src/ui, src/prompt-engine, src/tools for bugs. | None | PLANNED |
| 2 | M2: PoC & Diffs | Develop PoC reproducer scripts in `scratch/` and code changes/diffs to fix issues. | M1 | PLANNED |
| 3 | M3: Verification | Build project, run tests, run PoC to verify fixes. | M2 | PLANNED |
| 4 | M4: Final Audit | Write `audit_report.md` in root and run Forensic Auditor. | M3 | PLANNED |

## Code Layout
- `src/session/index.ts` - Main session logic, contains potential leaks, unhandled promises, and logic flaws.
- `src/session/compacter.ts` - Compacts context window when token limit is exceeded.
- `src/tools/` - Handler implementations for bash, read, write, edit, etc.
- `src/ui/` - CLI Ink rendering, custom components, input event handlers.
- `scratch/` - Target directory for reproduction PoC scripts.
- `audit_report.md` - Target file for the final audit report at project root.
