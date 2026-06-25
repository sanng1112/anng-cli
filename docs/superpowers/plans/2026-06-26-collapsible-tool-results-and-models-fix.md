# Cline-like Collapsible Tool Results & Fix "/models" Command — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Implement collapsible/expandable tool result sections in the TUI chat log (like Cline VS Code extension) and fix the missing "/models" slash command handler.

**Architecture:** Add a `ChatLogEntry` struct to replace raw `[]string` LogBuffer. Each entry carries type, content, tool metadata, and a collapse/expand toggle. The View() method renders sections with headers (icon + tool name + filename) and toggle-visible bodies. Add "/models" as an alias for "/model".

**Tech Stack:** Go 1.24, Bubble Tea, Lipgloss

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| internal/tui/chat_view.go | Modify | Define ChatLogEntry struct, replace LogBuffer type, update View() |
| internal/tui/chat_view_test.go | Modify | Add tests for collapsible rendering |
| internal/tui/app.go | Modify | Update LogBuffer refs, add /models alias |
| internal/tui/app_test.go | Modify | Add test for /models routing |
| README.md, README-en.md, README-zh_CN.md | Modify | Add /models to docs |
| cmd/anng/main.go | Modify | Add /models to help text |

---

### Task 1: Define ChatLogEntry struct and update ChatViewModel

**Files:**
- Modify: `internal/tui/chat_view.go:14-36`

- [ ] **Step 1: Replace LogBuffer []string with []ChatLogEntry**

Replace the existing LogBuffer field type and add the ChatLogEntry struct + helpers at the top of chat_view.go (after type ChatViewModel struct):

```go
type ChatLogEntry struct {
	Type        string // "user", "assistant", "tool", "system", "error"
	Content     string
	ToolName    string // "read_file", "bash", etc.
	ToolArg     string // filename or command preview
	Icon        string // emoji: "📄", "✏️", "⚡"
	HeaderColor string // color hex
	Collapsed   bool   // true = show only header
}

func UserChatEntry(content string) ChatLogEntry {
	return ChatLogEntry{Type: "user", Content: content, Collapsed: false}
}

func AssistantChatEntry(content string) ChatLogEntry {
	return ChatLogEntry{Type: "assistant", Content: content, Collapsed: false}
}

func ToolChatEntry(toolName, toolArg, content string) ChatLogEntry {
	icon, color := "🔧", "#888888"
	switch toolName {
	case "read_file", "read":
		icon, color = "📄", "#22c55e"
	case "write_to_file", "write":
		icon, color = "📝", "#f59e0b"
	case "replace_file_content", "edit", "multi_replace_file_content":
		icon, color = "✏️", "#f59e0b"
	case "bash":
		icon, color = "⚡", "#D4704B"
	case "search_web":
		icon, color = "🌐", "#888888"
	case "ask_question":
		icon, color = "❓", "#22c55e"
	case "HttpRequest":
		icon, color = "🔗", "#888888"
	}
	return ChatLogEntry{
		Type: "tool", ToolName: toolName, ToolArg: toolArg,
		Content: content, Icon: icon, HeaderColor: color,
		Collapsed: len(content) > 200,
	}
}

func SystemChatEntry(content string) ChatLogEntry {
	return ChatLogEntry{Type: "system", Content: content,
		Icon: "ℹ️", HeaderColor: "#888888"}
}

func ErrorChatEntry(content string) ChatLogEntry {
	return ChatLogEntry{Type: "error", Content: content,
		Icon: "❌", HeaderColor: "#ef4444"}
}
```

Replace `LogBuffer []string` with `LogBuffer []ChatLogEntry` in ChatViewModel.

- [ ] **Step 2: Add HoveredLogIdx and Ctrl+O toggle handler**

Add after `ScrollOffset int`:
```go
HoveredLogIdx int // -1 = none; index of entry to toggle
```

In Update(), after `case tea.KeyPgDown:` add:
```go
case tea.KeyCtrlO:
	if m.HoveredLogIdx >= 0 && m.HoveredLogIdx < len(m.LogBuffer) {
		entry := &m.LogBuffer[m.HoveredLogIdx]
		entry.Collapsed = !entry.Collapsed
	}
```

- [ ] **Step 3: Commit**

```bash
git add internal/tui/chat_view.go
git commit -m "feat: add ChatLogEntry struct with collapse/expand support"
```

---

### Task 2: Update View() rendering with collapsible sections

**Files:**
- Modify: `internal/tui/chat_view.go:300-438`

- [ ] **Step 1: Replace log rendering loop in View()**

Find the loop:
```go
logs := m.LogBuffer[startIdx:endIdx]
for _, line := range logs {
    sb.WriteString(line)
    sb.WriteString("\n")
}
```

Replace with:
```go
logEntries := m.LogBuffer[startIdx:endIdx]
for _, entry := range logEntries {
    rendered := renderChatLogEntry(entry, w)
    sb.WriteString(rendered)
    sb.WriteString("\n")
}
```

- [ ] **Step 2: Add renderChatLogEntry and renderToolSection functions**

Add before the View() method:
```go
func renderChatLogEntry(entry ChatLogEntry, width int) string {
	switch entry.Type {
	case "user":
		return lipgloss.NewStyle().Foreground(lipgloss.Color("#22c55e")).
			Bold(true).Render("> " + entry.Content)
	case "assistant":
		return entry.Content
	case "tool":
		return renderToolSection(entry, width)
	case "error":
		return lipgloss.NewStyle().Foreground(lipgloss.Color("#ef4444")).
			Render("❌ " + entry.Content)
	case "system":
		return lipgloss.NewStyle().Foreground(lipgloss.Color("#888888")).
			Italic(true).Render(entry.Content)
	default:
		return entry.Content
	}
}

func renderToolSection(entry ChatLogEntry, width int) string {
	var sb strings.Builder
	toggleIcon := "▶"
	if !entry.Collapsed {
		toggleIcon = "▼"
	}
	headerColor := entry.HeaderColor
	if headerColor == "" {
		headerColor = "#888888"
	}
	toolLabel := entry.ToolName
	if entry.ToolArg != "" {
		toolLabel = entry.ToolName + ": " + entry.ToolArg
	}
	headerText := fmt.Sprintf("%s %s %s", toggleIcon, entry.Icon, toolLabel)
	maxHeaderW := width - 6
	if maxHeaderW < 10 {
		maxHeaderW = 10
	}
	runes := []rune(headerText)
	if len(runes) > maxHeaderW {
		headerText = string(runes[:maxHeaderW-1]) + "…"
	}
	headerRendered := lipgloss.NewStyle().
		Background(lipgloss.Color(headerColor)).
		Foreground(lipgloss.Color("#FFFFFF")).
		Padding(0, 1).Render(headerText)
	sb.WriteString(headerRendered)
	sb.WriteString("\n")
	if !entry.Collapsed && entry.Content != "" {
		contentLines := strings.Split(entry.Content, "\n")
		bodyStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("#CCCCCC")).PaddingLeft(2)
		for _, line := range contentLines {
			sb.WriteString(bodyStyle.Render(line))
			sb.WriteString("\n")
		}
	}
	return sb.String()
}
```

- [ ] **Step 3: Commit**

```bash
git add internal/tui/chat_view.go
git commit -m "feat: implement collapsible tool result sections in chat log"
```

---

### Task 3: Update app.go — add "/models" alias and ChatLogEntry appends

**Files:**
- Modify: `internal/tui/app.go`
- Modify: `internal/tui/chat_view.go`

- [ ] **Step 1: Add "/models" alias in chat_view.go slash handler**

After `case "/model":` in ChatView.Update:
```go
case "/models":  // alias for /model
    return m, func() tea.Msg { return TriggerViewMsg{View: ViewModelSelect} }
```

- [ ] **Step 2: Add "/models" to slash items in app.go InitialModelWithConfig**

After `/model   — Chọn model AI`:
```go
"/models  — Chọn model AI (alias)",
```

- [ ] **Step 3: Update all LogBuffer appends in app.go to use ChatLogEntry helpers**

Find all `m.ChatView.LogBuffer = append(m.ChatView.LogBuffer, ...)` and wrap:
- System messages: SystemChatEntry(...)
- User messages: UserChatEntry(...)
- Error messages: ErrorChatEntry(...)
- Tool results: ToolChatEntry(toolName, toolArg, content)

- [ ] **Step 4: Handle SwitchModelMsg and BackToChatMsg in app.go**

Add case for SwitchModelMsg:
```go
case SwitchModelMsg:
	m.Config.Model = msg.Model
	m.CurrentView = ViewChat
	m.ChatView.LogBuffer = append(m.ChatView.LogBuffer,
		SystemChatEntry(fmt.Sprintf("Model switched to: %s", msg.Model)))
	saveConfig(m.Config)
	return m, nil

case BackToChatMsg:
	m.CurrentView = ViewChat
	return m, nil
```

Also in ModelSelectView update handling in app.go, ensure SwitchModelMsg is caught after delegation:
```go
case ViewModelSelect:
	var cmd tea.Cmd
	m.ModelSelectView, cmd = m.ModelSelectView.Update(msg)
	// Check for return messages
	switch msg.(type) {
	case SwitchModelMsg:
		// handled above
		return m, cmd
	case BackToChatMsg:
		m.CurrentView = ViewChat
		return m, nil
	}
```

- [ ] **Step 5: Commit**

```bash
git add internal/tui/app.go internal/tui/chat_view.go
git commit -m "feat: add /models alias, update LogBuffer to use ChatLogEntry"
```

---

### Task 4: Update tests

**Files:**
- Modify: `internal/tui/chat_view_test.go`
- Modify: `internal/tui/app_test.go`

- [ ] **Step 1: Add test for ChatLogEntry creation**

```go
func TestChatLogEntryTypes(t *testing.T) {
	userEntry := UserChatEntry("Hello")
	if userEntry.Type != "user" || userEntry.Content != "Hello" {
		t.Errorf("UserChatEntry mismatch: %+v", userEntry)
	}
	toolEntry := ToolChatEntry("read_file", "main.go", "content")
	if toolEntry.Type != "tool" || toolEntry.ToolName != "read_file" || toolEntry.Icon != "📄" {
		t.Errorf("ToolChatEntry mismatch: %+v", toolEntry)
	}
	if ToolChatEntry("bash", "ls", "out").Collapsed {
		t.Errorf("expected short content (<200) expanded by default")
	}
	if !ToolChatEntry("bash", "ls", string(make([]byte, 300))).Collapsed {
		t.Errorf("expected long content (>200) collapsed by default")
	}
	errEntry := ErrorChatEntry("fail")
	if errEntry.Type != "error" || errEntry.Icon != "❌" {
		t.Errorf("ErrorChatEntry mismatch: %+v", errEntry)
	}
	sysEntry := SystemChatEntry("done")
	if sysEntry.Type != "system" || sysEntry.Icon != "ℹ️" {
		t.Errorf("SystemChatEntry mismatch: %+v", sysEntry)
	}
}
```

- [ ] **Step 2: Add test for collapse toggle**

```go
func TestCollapseToggle(t *testing.T) {
	cfg := AppConfig{Model: "gpt-4o"}
	model := NewChatViewModel(cfg, []string{"/model"})
	entry := ToolChatEntry("read_file", "test.go", "file content here")
	entry.Collapsed = true
	model.LogBuffer = append(model.LogBuffer, entry)
	view := model.View()
	if !strings.Contains(view, "▶") {
		t.Errorf("expected collapsed indicator ▶, got: %q", view)
	}
	model.HoveredLogIdx = 0
	model, _ = model.Update(tea.KeyMsg{Type: tea.KeyCtrlO})
	view2 := model.View()
	if !strings.Contains(view2, "▼") {
		t.Errorf("expected expanded indicator ▼ after toggle, got: %q", view2)
	}
	if !strings.Contains(view2, "file content here") {
		t.Errorf("expanded entry should show content, got: %q", view2)
	}
}
```

- [ ] **Step 3: Add test for /models alias**

```go
func TestModelsAliasCommand(t *testing.T) {
	cfg := AppConfig{Model: "gpt-4o"}
	model := NewChatViewModel(cfg, []string{"/model", "/models"})
	model.Buffer.Insert("/models")
	newModel, cmd := model.Update(tea.KeyMsg{Type: tea.KeyEnter})
	if cmd == nil {
		t.Fatalf("expected cmd for /models command")
	}
	msg := cmd()
	trigger, ok := msg.(TriggerViewMsg)
	if !ok || trigger.View != ViewModelSelect {
		t.Errorf("expected TriggerViewMsg with ViewModelSelect, got %v", msg)
	}
	_ = newModel
}
```

- [ ] **Step 4: Add LogBuffer type verification test**

```go
func TestChatViewModelLogBufferType(t *testing.T) {
	cfg := AppConfig{Model: "gpt-4o"}
	model := NewChatViewModel(cfg, nil)
	model.LogBuffer = append(model.LogBuffer,
		UserChatEntry("test"),
		AssistantChatEntry("response"),
		ToolChatEntry("bash", "echo hi", "hi"),
	)
	if len(model.LogBuffer) != 3 {
		t.Errorf("expected 3 entries, got %d", len(model.LogBuffer))
	}
	if model.LogBuffer[0].Type != "user" || model.LogBuffer[1].Type != "assistant" || model.LogBuffer[2].Type != "tool" {
		t.Errorf("entry types mismatch")
	}
}
```

- [ ] **Step 5: Run the new tests**

Run: `go test ./internal/tui/ -v -run "TestChatLogEntryTypes|TestCollapseToggle|TestModelsAliasCommand|TestChatViewModelLogBufferType"`
Expected: All 4 new tests PASS.

- [ ] **Step 6: Commit**

```bash
git add internal/tui/chat_view_test.go internal/tui/app_test.go
git commit -m "test: add tests for ChatLogEntry, collapse toggle, and /models"
```

---

### Task 5: Update docs — README and help text

**Files:**
- Modify: `README.md`
- Modify: `README-en.md`
- Modify: `README-zh_CN.md`
- Modify: `cmd/anng/main.go`

- [ ] **Step 1: Add /models to README.md**

After "/model" row, add:
```
| /models | Chọn model (alias) |
```

- [ ] **Step 2: Add /models to main.go help text**

In printHelp(), after `/model`:
```
  /models          Choose AI model (alias)
```

- [ ] **Step 3: Commit**

```bash
git add README.md README-en.md README-zh_CN.md cmd/anng/main.go
git commit -m "docs: add /models command to documentation and help text"
```

---

### Task 6: Final build & verification

**Files:**
- Verify: all modified files compile

- [ ] **Step 1: Run all TUI tests**

Run: `go test ./internal/tui/ -v`
Expected: All tests (old + new) PASS.

- [ ] **Step 2: Build the binary**

Run: `go build ./cmd/anng`
Expected: Binary builds successfully at ./anng.

- [ ] **Step 3: Push to GitHub**

```bash
git add -A
git commit -m "chore: final verification - collapsible tool results and /models fix"
git push origin develop
```

---

## Self-Review Checklist

**1. Spec coverage:**
- ✅ Collapsible tool result sections: Tasks 1-2 implement ChatLogEntry, collapse toggle, collapsible rendering
- ✅ "/models" command: Task 3 adds alias, Task 5 updates docs
- ✅ Tests: Task 4 covers all new functionality
- ✅ Build verification: Task 6 ensures everything compiles

**2. Placeholder scan:** No placeholders found. All code blocks complete.

**3. Type consistency:**
- `ChatLogEntry` struct used consistently across all tasks
- `LogBuffer` type changed from `[]string` to `[]ChatLogEntry` everywhere
- Helpers `UserChatEntry`, `AssistantChatEntry`, `ToolChatEntry`, `SystemChatEntry`, `ErrorChatEntry` defined once
- `HoveredLogIdx` field in ChatViewModel for toggle targeting
- `Collapsed` bool on ChatLogEntry for state tracking

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-26-collapsible-tool-results-and-models-fix.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
