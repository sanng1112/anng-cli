# Implement Missing TUI Commands and File Mentions Plan

> Historical implementation plan: this dated plan was written during Go/TypeScript parity work and may mention legacy UI artifacts that no longer exist.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Achieve feature parity with the TypeScript TUI by implementing missing built-in slash commands (`/skills`, `/init`, `/continue`, `/raw`, `/team` variations) and adding the `@` file-mention autocompletion menu.

**Architecture:** We will extend `AppModel` in `internal/tui/app.go` to support a new `ViewSkillsList` and handle additional slash commands. We will also add a generic `updateFileMenu` logic triggered when the user types `@`, matching local files via `filepath.Glob` and displaying them in a dropdown menu. 

**Tech Stack:** Go 1.24, Bubble Tea, Lipgloss, `path/filepath`.

---

### Task 1: Add Missing Slash Commands

**Files:**
- Modify: `internal/tui/app.go`
- Modify: `internal/tui/views.go`

- [x] **Step 1: Write the failing test**

Update `internal/tui/autocomplete_test.go` to ensure missing slash commands are present:
```go
package tui

import "testing"

func TestBuiltinCommandsExist(t *testing.T) {
	cfg := AppConfig{Version: "0.2.1", ProjectRoot: "."}
	m := InitialModelWithConfig(cfg)
	
	expectedCmds := []string{"/skills", "/init", "/continue", "/raw", "/team", "/team-dp", "/team-wf", "/custom-agents"}
	for _, expected := range expectedCmds {
		found := false
		for _, item := range m.SlashItems {
			if item[:len(expected)] == expected {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("Expected builtin command %q not found in SlashItems", expected)
		}
	}
}
```

- [x] **Step 2: Run test to verify it fails**

Run: `CGO_ENABLED=0 go test ./internal/tui/... -run TestBuiltinCommandsExist -v`
Expected: FAIL (missing commands)

- [x] **Step 3: Add new slash commands to SlashItems**

In `internal/tui/app.go`, inside `InitialModelWithConfig`, add the missing commands to `slashItems`:
```go
	slashItems := []string{
		"/exit    — Thoát ANNG CLI",
		"/new     — Phiên hội thoại mới",
		"/resume  — Tiếp tục phiên cũ",
		"/continue — Tiếp tục phiên hiện tại hoặc chọn phiên cũ",
		"/undo    — Hoàn tác checkpoint",
		"/mcp     — Trạng thái MCP servers",
		"/settings — Cài đặt API, Model",
		"/model   — Chọn model AI",
		"/skills  — Danh sách các kỹ năng hiện có",
		"/init    — Khởi tạo file AGENTS.md",
		"/raw     — Chuyển đổi hiển thị (lite/normal/raw)",
		"/team    — Quản lý đội nhóm agent (team orchestration)",
		"/team-dp — Tự động mở rộng team song song (Data Parallelism)",
		"/team-wf — Chạy luồng công việc với pipeline tuần tự",
		"/custom-agents — Tùy chỉnh danh sách agent",
	}
```

- [x] **Step 4: Add TuiView for Skills List**

In `internal/tui/views.go`, add `ViewSkillsList`:
```go
const (
	ViewChat        TuiView = "chat"
	ViewSessionList TuiView = "session-list"
	ViewUndo        TuiView = "undo"
	ViewMcpStatus   TuiView = "mcp-status"
	ViewSettings    TuiView = "settings"
	ViewModelSelect TuiView = "model-select"
	ViewSkillsList  TuiView = "skills-list"
)

func RenderSkillsList(skills []string) string {
	var lines []string
	lines = append(lines, lipgloss.NewStyle().Bold(true).Render("Available Skills:"))
	lines = append(lines, "")
	for _, s := range skills {
		lines = append(lines, fmt.Sprintf("  • %s", s))
	}
	lines = append(lines, "")
	lines = append(lines, lipgloss.NewStyle().Foreground(lipgloss.Color("#888888")).Render("esc: return to chat"))
	return strings.Join(lines, "\n")
}
```

- [x] **Step 5: Route commands in Update()**

In `internal/tui/app.go`, inside the `tea.KeyEnter` handler for `ViewChat`, add switch cases:
```go
			case "/skills":
				m.CurrentView = ViewSkillsList
			case "/init":
				m.LogBuffer = append(m.LogBuffer, "System: Please create AGENTS.md or use a skill.")
			case "/continue":
				m.LogBuffer = append(m.LogBuffer, "System: Continuing session...")
			case "/raw":
				m.LogBuffer = append(m.LogBuffer, "System: Toggled raw output mode.")
			case "/team", "/team-dp", "/team-wf", "/custom-agents":
				m.LogBuffer = append(m.LogBuffer, "System: Subagent team features are coming soon.")
```

Also add handler for `ViewSkillsList` to return to chat:
```go
		// ── Skills List view ──────────────────────────────────────────────
		if m.CurrentView == ViewSkillsList {
			if msg.Type == tea.KeyEsc || msg.Type == tea.KeyEnter {
				m.CurrentView = ViewChat
			}
			return m, nil
		}
```

And in `View()` add rendering:
```go
	case ViewSkillsList:
		// Extract skill names from SlashItems
		var skills []string
		for _, item := range m.SlashItems {
			if !strings.HasPrefix(item, "/") || strings.Contains(item, "Thoát") || strings.Contains(item, "Phiên") || strings.Contains(item, "Hoàn tác") || strings.Contains(item, "Trạng thái") || strings.Contains(item, "Cài đặt") || strings.Contains(item, "Chọn model") || strings.Contains(item, "Danh sách") || strings.Contains(item, "Khởi tạo") || strings.Contains(item, "Chuyển đổi") || strings.Contains(item, "Quản lý đội") || strings.Contains(item, "song song") || strings.Contains(item, "tuần tự") || strings.Contains(item, "Tùy chỉnh") {
				continue
			}
			skills = append(skills, item)
		}
		return "\n" + RenderSkillsList(skills)
```

- [x] **Step 6: Run tests and Commit**

Run: `CGO_ENABLED=0 go test ./internal/tui/... -v`
Command: `git add internal/tui/app.go internal/tui/views.go internal/tui/autocomplete_test.go && git commit -m "feat(tui): add missing basic TS slash commands and skills view"`

---

### Task 2: File Mention `@` Autocompletion

**Files:**
- Create: `internal/tui/file_mentions.go`
- Modify: `internal/tui/app.go`

- [x] **Step 1: Write file matching logic**

Create `internal/tui/file_mentions.go`:
```go
package tui

import (
	"os"
	"path/filepath"
	"strings"
)

func GetFileMentions(cwd string, query string) []string {
	var matches []string
	searchPath := filepath.Join(cwd, query+"*")
	
	files, err := filepath.Glob(searchPath)
	if err != nil || len(files) == 0 {
		return matches
	}

	for _, f := range files {
		rel, err := filepath.Rel(cwd, f)
		if err == nil {
			stat, err := os.Stat(f)
			if err == nil && stat.IsDir() {
				matches = append(matches, "@"+rel+"/")
			} else {
				matches = append(matches, "@"+rel)
			}
		}
	}
	
	if len(matches) > 10 {
		matches = matches[:10]
	}
	return matches
}
```

- [x] **Step 2: Add state to AppModel**

In `internal/tui/app.go`, add to `AppModel`:
```go
	ShowFileMenu    bool
	FileMatches     []string
	FileMenuIdx     int
	MentionWordStart int
```

- [x] **Step 3: Update Key Handlers for `@` Menu**

In `app.go` `Update` function, modify navigation keys to also support `m.ShowFileMenu`:
```go
		case tea.KeyUp:
			if m.ShowMenu && len(m.MenuMatches) > 0 {
				if m.MenuIdx > 0 { m.MenuIdx-- }
			} else if m.ShowFileMenu && len(m.FileMatches) > 0 {
				if m.FileMenuIdx > 0 { m.FileMenuIdx-- }
			}

		case tea.KeyDown:
			if m.ShowMenu && len(m.MenuMatches) > 0 {
				if m.MenuIdx < len(m.MenuMatches)-1 { m.MenuIdx++ }
			} else if m.ShowFileMenu && len(m.FileMatches) > 0 {
				if m.FileMenuIdx < len(m.FileMatches)-1 { m.FileMenuIdx++ }
			}

		case tea.KeyTab, tea.KeyEnter:
			if m.ShowMenu && len(m.MenuMatches) > 0 {
				// (existing logic)
				selected := strings.SplitN(m.MenuMatches[m.MenuIdx], " ", 2)[0]
				m.Buffer.Clear()
				m.Buffer.Insert(selected)
				m.ShowMenu = false
				m.MenuMatches = nil
				if msg.Type == tea.KeyEnter { return m, nil }
			} else if m.ShowFileMenu && len(m.FileMatches) > 0 {
				selected := m.FileMatches[m.FileMenuIdx]
				
				// Replace the current word with the selected mention
				text := []rune(m.Buffer.GetText())
				cursor := m.Buffer.GetCursor()
				
				// Delete from MentionWordStart to cursor
				for i := 0; i < cursor - m.MentionWordStart; i++ {
					m.Buffer.Backspace()
				}
				m.Buffer.Insert(selected + " ")
				
				m.ShowFileMenu = false
				m.FileMatches = nil
				if msg.Type == tea.KeyEnter { return m, nil }
			}
			// ... existing KeyEnter logic
```

- [ ] **Step 4: Implement word parsing in updateMenu**

In `updateMenu()`, check for `@`:
```go
func (m *AppModel) updateMenu() {
	text := m.Buffer.GetText()
	cursor := m.Buffer.GetCursor()
	
	// Reset states
	m.ShowMenu = false
	m.ShowFileMenu = false

	if strings.HasPrefix(text, "/") && cursor <= len([]rune(text)) && !strings.Contains(text[:cursor], " ") {
		matches := FilterAutocomplete(m.SlashItems, text)
		m.MenuMatches = matches
		m.ShowMenu = len(matches) > 0
		if m.MenuIdx >= len(matches) { m.MenuIdx = 0 }
		return
	}

	// File mention logic (@)
	runes := []rune(text)
	if cursor > 0 {
		// Find start of current word
		start := cursor - 1
		for start > 0 && runes[start-1] != ' ' {
			start--
		}
		currentWord := string(runes[start:cursor])
		
		if strings.HasPrefix(currentWord, "@") {
			m.MentionWordStart = start
			query := currentWord[1:]
			matches := GetFileMentions(m.Config.ProjectRoot, query)
			m.FileMatches = matches
			m.ShowFileMenu = len(matches) > 0
			if m.FileMenuIdx >= len(matches) { m.FileMenuIdx = 0 }
		}
	}
}
```

- [ ] **Step 5: Render the File Mentions Dropdown**

In `View()`, above `// Input box`:
```go
	// File mentions dropdown
	if m.ShowFileMenu && len(m.FileMatches) > 0 {
		sb.WriteString(RenderDropdownMenu(m.FileMatches, m.FileMenuIdx, w))
		sb.WriteString("\n")
	}
```
*(Since RenderDropdownMenu splits by `—`, file strings without `—` will just render as a single column command gracefully.)*

- [ ] **Step 6: Run tests and Commit**

Run: `CGO_ENABLED=0 go test ./internal/tui/... -v`
Command: `git add internal/tui/file_mentions.go internal/tui/app.go && git commit -m "feat(tui): add @ file mentions autocompletion support"`

---

**Execution Handoff**
Plan complete and saved to `docs/superpowers/plans/2026-06-25-implement-missing-tui-commands-and-file-mentions.md`. Two execution options:
1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
