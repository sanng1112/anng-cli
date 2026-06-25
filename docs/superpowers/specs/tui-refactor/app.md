# Specification: `internal/tui/app.go`

> Historical TUI refactor spec: this file compares the Go implementation with the removed TypeScript UI. Any `src/ui/...` or `.tsx` references are legacy comparison material.

## 1. Description & Purpose
`app.go` defines the entry point, the root `AppModel`, and the primary loop (`Init`, `Update`, `View`) of the Bubble Tea TUI. It handles the overall layout, processes global lifecycle events (window size changes, process stdout streams, task completion notifications), and acts as a router/dispatcher.

## 2. TS Counterpart Comparison
* **TS File:** [App.tsx](file:///run/media/sanng/New%20Volume/Seminar/Anng_cli/src/ui/views/App.tsx)
* **TS Responsibility:** Orchestrates session manager, LLM stream progress state, MCP status reports, permission prompt modals, and manages view switching. It dynamically passes callbacks like `onSubmit`, `onModelConfigChange`, etc. to the child view components.
* **Go Current State:** Monolithic `Update()` that processes all keyboard controls manually and maintains separate variables for every view (`Sessions`, `Checkpoints`, `SlashItems`, `FileMatches`, `PendingPermission`, etc.).
* **Functional Gap:** No clean sub-component delegation. State transitions are verbose and buggy (e.g. entering a custom model crashes or stays stuck in `ViewInput`).

## 3. Specifications for Refactoring

### A. Modular `AppModel` State Struct
The refactored `AppModel` should be slim. It must delegate view-specific states to nested sub-models:

```go
type AppModel struct {
	// Global Terminal Info
	Width  int
	Height int

	// View Routing & States
	CurrentView TuiView
	Busy        bool
	ErrLine     string
	LogBuffer   []string

	// Sub-Models (Bubble Tea sub-components)
	ChatInput      ChatInputModel       // Handles chat input, buffer, autocomplete & mentions
	SessionList    SessionListModel     // For ViewSessionList
	UndoSelector   UndoSelectorModel    // For ViewUndo
	McpStatus      McpStatusModel       // For ViewMcpStatus
	SettingsView   SettingsViewModel    // For ViewSettings
	ModelSelector  ModelSelectorModel   // For ViewModelSelect
	SkillsList     SkillsListModel      // For ViewSkillsList
	Permission     PermissionModel      // For permission overlay prompts

	// Process output overlay
	ShowStdout    bool
	StdoutBuf     string
	StdoutCommand string

	Config AppConfig
}
```

### B. Keyboard and Message Routing Logic in `Update()`
The root `Update` function should only process:
1. System/Global messages (`tea.WindowSizeMsg`, `AgentFinishedMsg`, process stdout updates).
2. Global exit keys (`Ctrl+C` / `Ctrl+D` if the focus isn't consumed).
3. Routing of view-specific key events to the active sub-model:

```go
func (m AppModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd

	// 1. Handle Global / System Messages first
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.Width = msg.Width
		m.Height = msg.Height
		// Propagate window resize to all sub-models
		m.ChatInput, _ = m.ChatInput.Update(msg)
		// ... repeat for all other sub-models
		return m, nil

	case AgentFinishedMsg:
		m.Busy = false
		if msg.Err != nil {
			m.ErrLine = msg.Err.Error()
		} else {
			m.LogBuffer = append(m.LogBuffer, "Agent completed execution.")
		}
		return m, nil
	}

	// 2. Delegate key events to appropriate sub-model depending on active view
	if m.PendingPermission != nil {
		m.Permission, cmd = m.Permission.Update(msg)
		// Check for PermissionReplyMsg to apply action
		return m, cmd
	}

	switch m.CurrentView {
	case ViewChat:
		m.ChatInput, cmd = m.ChatInput.Update(msg)
		// Handle custom output messages like SubmitPromptMsg
	case ViewSessionList:
		m.SessionList, cmd = m.SessionList.Update(msg)
	case ViewUndo:
		m.UndoSelector, cmd = m.UndoSelector.Update(msg)
	case ViewSettings:
		m.SettingsView, cmd = m.SettingsView.Update(msg)
	case ViewModelSelect:
		m.ModelSelector, cmd = m.ModelSelector.Update(msg)
	// ... other cases ...
	}

	return m, cmd
}
```

### C. UI Rendering in `View()`
* The main screen rendering should construct layout blocks (Header/Mascot + Scrollback logs + Overlay notifications/Modals + Input box + Help bars).
* If a modal sub-model or overlay view is active, render it directly, or overlay it on top of the chat view.
