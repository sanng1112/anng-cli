# Specification: `internal/tui/prompts.go`

> Historical TUI refactor spec: legacy React/Ink prompt components cited here are archival comparison points, not current runtime files.

## 1. Description & Purpose
`prompts.go` is responsible for rendering overlay modals. This includes permission prompts (confirming dangerous tool executions like file deletes or shell scripts) and interactive multi-choice question prompts from the agent.

## 2. TS Counterpart Comparison
* **TS Files:**
  * [PermissionPrompt.tsx](file:///run/media/sanng/New%20Volume/Seminar/Anng_cli/src/ui/views/PermissionPrompt.tsx)
  * [AskUserQuestionPrompt.tsx](file:///run/media/sanng/New%20Volume/Seminar/Anng_cli/src/ui/views/AskUserQuestionPrompt.tsx)
* **TS Responsibility:** Validates and color-codes request scopes (e.g., green for cwd reads, red for system write/deletes), displays prompt options as interactive lists, handles key capture, and fires resolution responses.
* **Go Current State:** Implements simple static `RenderPermissionPrompt` which maps option indices statically.
* **Functional Gap:** The cursor index state (`PermCursor`) lives inside the monolithic `AppModel`, creating state pollution when transitioning between views. Also lacks support for `AskUserQuestionPrompt` (user multiple-choice prompts), which is completely unimplemented in Go.

## 3. Specifications for Refactoring

### A. Isolate Component Structures
Split the overlays into stateful sub-models:

```go
type PermissionModel struct {
	Request  PermissionRequest
	Cursor   int // Active choice: 0=Yes, 1=Yes Always, 2=No
	Active   bool
}

type AskUserQuestionModel struct {
	Question     string
	Options      []string
	Cursor       int
	IsMulti      bool
	SelectedOpts map[int]bool // Tracking checkboxes for multi-select questions
	Active       bool
}
```

### B. Keyboard Actions

#### 1. Permission Confirmation
* `Up Arrow` / `Down Arrow`: Toggle selection highlight (0 = "Yes", 1 = "Yes, always allow", 2 = "No").
* `Enter`: Fire selection command back to router.
* `Esc`: Cancel prompt (resolves as "No").

#### 2. Multi-choice Questions
* `Up Arrow` / `Down Arrow`: Scroll options list.
* `Space`: Toggle checkbox state (only if `IsMulti` is true).
* `Enter`: Submit selected answers.
* `Esc`: Cancel questions prompt.

### C. Visual Rendering Specifications
* **Risk Color Coding:** Retain color coding based on risk scopes:
  * **Green (`#22c55e`):** `read-in-cwd`, `query-git-log`.
  * **Amber (`#f59e0b`):** `read-out-cwd`, `write-in-cwd`, `network`, `mcp`.
  * **Red (`#ef4444`):** `write-out-cwd`, `delete`, `unknown`.
* **Layout Cards:** Enclose prompts in double-line borders (`DoubleBorder`) to draw eye attention, and add help tags (e.g. `space: select  •  enter: submit`).
