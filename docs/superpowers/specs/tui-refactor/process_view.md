# Specification: `internal/tui/process_view.go`

> Historical TUI refactor spec: this file preserves comparison notes against the removed TypeScript UI and may reference non-existent `src/ui/...` files.

## 1. Description & Purpose
`process_view.go` provides an active overlay console window. When the CLI agent spawns a background shell command (e.g. `npm build` or compilation tasks), developers can switch to this view to audit progress logs in real-time.

## 2. TS Counterpart Comparison
* **TS File:** [ProcessStdoutView.tsx](file:///run/media/sanng/New%20Volume/Seminar/Anng_cli/src/ui/views/ProcessStdoutView.tsx)
* **TS Responsibility:** Monitors active subprocess maps, tracks timeout durations, formats scroll viewports, and accepts key input commands.
* **Go Current State:** Standard string buffer truncater that renders simple borders.
* **Functional Gap:** Log logs are cut off arbitrarily; scrollbars or keyboard log scrolling are missing. The timeout display stays static as `...`.

## 3. Specifications for Refactoring

### A. Subprocess Model State
Model active subprocess console state:

```go
type ProcessStdoutView struct {
	CommandName string
	StdoutLog   string
	ScrollOffset int // For viewing historical lines
	TimeoutMs    int // Current time limit allocation
	Active       bool
}
```

### B. Keyboard Actions
When Process View is focused, handle keys as follows:

| Key Press | View Action |
| :--- | :--- |
| `Esc` | Return to background execution (return to normal chat input) |
| `Up Arrow` / `Down Arrow` | Scroll the active terminal logs up or down |
| `t` | Prompt the user to adjust/extend command execution timeout limits |

### C. Visual Rendering Specifications
* **Viewport Scrolling:** Format and slice output logs to display only the current visible rows based on window `Height`:
  ```go
  visibleLines := height - 8 // Reserve room for header and footer borders
  ```
* **Timeout Tracker:** Keep a live timer ticker that updates the screen showing remaining timeout seconds:
  ```
  Timeout countdown: 12 seconds remaining
  ```
* **Border Style:** Render a styled double border frame (`lipgloss.DoubleBorder`) using the brand color Orange to distinguish the process output window from standard chat logs.
