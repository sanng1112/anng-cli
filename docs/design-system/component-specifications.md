# Component Specifications --- ANNG CLI TUI

> **Platform:** Terminal UI
> **Current stack:** Go + Bubble Tea + Lip Gloss
> **Scope:** Current reusable view primitives in the Go runtime
> **Accent color:** `#D4704B`

This document replaces an older Ink/React/TypeScript component spec. The current runtime no longer renders `src/ui/...` components; the active implementation lives under `internal/tui/`.

## 1. Design Tokens

The current Go TUI centers around a small shared visual language:

| Token | Usage |
| --- | --- |
| `BrandOrangeColor` | Primary accent, selections, highlights |
| `ColorGreen` | Success status |
| `ColorRed` | Error and destructive status |
| `ColorGray` | Secondary labels and dimmed text |

Typography remains terminal-native and monospace. Layout is driven by Bubble Tea window sizing plus Lip Gloss spacing, borders, and alignment helpers.

## 2. Current Reusable Building Blocks

The current Go runtime reuses a smaller set of primitives than the legacy design-system plan:

| Primitive | Purpose | Current file |
| --- | --- | --- |
| Dropdown menu | Keyboard-navigable selection list | `internal/tui/dropdown_menu.go` |
| Input buffer | Editable prompt buffer with cursor movement and undo/redo | `internal/tui/input_buffer.go` |
| Permission prompt view | Interactive command approval UI | `internal/tui/permission_prompt_view.go` |
| Session / undo list views | Structured selectable history lists | `internal/tui/list_views.go` |
| Model / skills / MCP list views | Focused chooser screens built on dropdowns | `internal/tui/model_skills_views.go` |

## 3. Interaction Model

The current TUI is keyboard-first and Bubble Tea state-driven:

- `Enter`: submit or confirm
- `Esc`: go back, cancel, or interrupt
- Arrow keys: move selection
- `Ctrl+J`: insert newline in the prompt buffer
- `Ctrl+C` or `Ctrl+D`: quit

Focus is view-level rather than component-tree based. The active Bubble Tea model decides which key handlers apply.

## 4. Layout Principles

- Keep one primary active view at a time
- Prefer full-screen state transitions over floating modal stacks
- Use dropdown/list patterns for selection-heavy flows
- Stream shell output into a dedicated overlay instead of inline log flooding

## 5. Current File Map

| Area | Current location |
| --- | --- |
| App shell and routing | `internal/tui/app.go` |
| Chat screen | `internal/tui/chat_view.go` |
| Settings screen | `internal/tui/settings_view.go` |
| Dropdown primitive | `internal/tui/dropdown_menu.go` |
| Session and undo views | `internal/tui/list_views.go` |
| Model / skills / MCP views | `internal/tui/model_skills_views.go` |
| Permission prompt | `internal/tui/permission_prompt_view.go` |
| Shared tests | `internal/tui/*_test.go` |

## 6. Historical Note

If you find references to:

- `src/ui/...`
- Ink / React components
- `.tsx` component paths
- Button / Modal / Table specs from the removed TypeScript UI

Treat them as legacy material from before the Go migration unless they have been explicitly updated.
