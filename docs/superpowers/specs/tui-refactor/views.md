# Specification: `internal/tui/views.go`

> Historical TUI refactor spec: this document may reference removed TypeScript view files to explain intended parity. Those paths are not active runtime locations.

## 1. Description & Purpose
`views.go` handles auxiliary routing screen layouts, including lists for resuming chat sessions, choosing undo checkpoints, checking active MCP servers, listing skills, and switching AI model providers.

## 2. TS Counterpart Comparison
* **TS Files:**
  * [SessionList.tsx](file:///run/media/sanng/New%20Volume/Seminar/Anng_cli/src/ui/views/SessionList.tsx)
  * [UndoSelector.tsx](file:///run/media/sanng/New%20Volume/Seminar/Anng_cli/src/ui/views/UndoSelector.tsx)
  * [McpStatusList.tsx](file:///run/media/sanng/New%20Volume/Seminar/Anng_cli/src/ui/views/McpStatusList.tsx)
  * [ModelsDropdown/index.tsx](file:///run/media/sanng/New%20Volume/Seminar/Anng_cli/src/ui/components/ModelsDropdown/index.tsx)
* **TS Responsibility:** Provides interactive panels with full input capability (scrolling lists, deleting records, renaming session titles, choosing undo mode "code-only" vs "code-and-conversation").
* **Go Current State:** Implements pure layout-string formatting loops.
* **Functional Gap:** Lacks interactive state, keyboard hooks, list scrolling limits, session deletion, session rename triggers, and model editing capabilities.

## 3. Specifications for Refactoring

### A. Sub-Model Conversions
All screens must be refactored as stateful bubble sub-components.

#### 1. Session Selector Model
```go
type SessionListModel struct {
	Sessions    []string
	SelectedIdx int
	ScrollIdx   int
	RenameInput string // Temp storage for editing names
	IsEditing   bool
}
```
* **Key Commands:**
  * `d`: Send `DeleteSessionMsg` to delete the selected history session.
  * `r`: Toggle editing input box to rename the highlighted session.
  * `Enter`: Select session to resume.
  * `Esc`: Exit session menu.

#### 2. Undo Selector Model
```go
type UndoSelectorModel struct {
	Checkpoints []string
	SelectedIdx int
	ModeCursor  int // 0 = Code & Conversation, 1 = Code Only
}
```
* **Key Commands:**
  * `Left Arrow` / `Right Arrow`: Toggle restore mode choice.
  * `Enter`: Trigger undo command with chosen mode.
  * `Esc`: Exit undo menu.

#### 3. Model Selector Model
```go
type ModelSelectorModel struct {
	Models      []string
	SelectedIdx int
}
```
* **Key Commands:**
  * `Enter`: Switch active AI model. If "+ Add custom model..." is selected, switch layout to text input context to register custom name.

### B. Visual Scroll Viewports
For Session List, Model Selector, and Undo Checkpoints:
* Set maximum list viewport height to 10 lines.
* Implement pagination scrolling (sliding window index offset) so that selection is always visible on long lists.
