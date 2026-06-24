# Port All TS Tools and Model Selector to Go Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Complete the Go refactoring of `anng-cli` by adding the `/model` selector view, handling the autocomplete option, and implementing all core reasoning tools (`read_file`, `write_to_file`, `replace_file_content`, `multi_replace_file_content`, `ask_question`, `search_web`) to match the TypeScript tool specification.

**Architecture:** Extend `internal/tools/` package with dedicated tool implementations and JSON argument mapping. Register these tools in the orchestrator's tool registry. Add a `ViewModelSelector` state to `AppModel` and render the interactive model list using bubbletea key bindings.

**Tech Stack:** Go 1.24, `github.com/charmbracelet/bubbletea`, `github.com/charmbracelet/lipgloss`.

---

### Task 1: Register and Implement the Model Selector view (`/model`)

**Files:**
- Modify: `internal/tui/views.go`
- Modify: `internal/tui/app.go`

- [x] **Step 1: Define ViewModelSelector state and view layout**

Add `ViewModelSelector` to `TuiView` enum in `internal/tui/views.go`:
```go
const (
	ViewChat        TuiView = "chat"
	ViewSessionList TuiView = "session-list"
	ViewUndo        TuiView = "undo"
	ViewMcpStatus   TuiView = "mcp-status"
	ViewSettings    TuiView = "settings"
	ViewModelSelect TuiView = "model-select"
)
```

- [x] **Step 2: Add Model Selector rendering function in views.go**

```go
func RenderModelSelector(models []string, selectedIdx int) string {
	var lines []string
	lines = append(lines, lipgloss.NewStyle().Bold(true).Render("Select AI Provider Model:"))
	lines = append(lines, "")
	for idx, m := range models {
		if idx == selectedIdx {
			lines = append(lines, lipgloss.NewStyle().Foreground(lipgloss.Color(BrandOrangeColor)).Render(fmt.Sprintf("> %s", m)))
		} else {
			lines = append(lines, fmt.Sprintf("  %s", m))
		}
	}
	lines = append(lines, "")
	lines = append(lines, lipgloss.NewStyle().Foreground(lipgloss.Color("#888888")).Render("enter: select model  •  esc: cancel"))
	return strings.Join(lines, "\n")
}
```

- [x] **Step 3: Add Keyboard Mapping and View Handler in app.go**

In `internal/tui/app.go` add the `/model` case:
```go
			case "/model":
				m.CurrentView = ViewModelSelect
				m.Sessions = []string{"gpt-4o", "claude-3-5-sonnet", "deepseek-chat", "gemini-1.5-pro"}
				m.SessionIdx = 0
```

Add key handlers for `ViewModelSelect` view in `Update`:
```go
		// ── Model select view ──────────────────────────────────────────────
		if m.CurrentView == ViewModelSelect {
			switch msg.Type {
			case tea.KeyEsc:
				m.CurrentView = ViewChat
			case tea.KeyUp:
				if m.SessionIdx > 0 {
					m.SessionIdx--
				}
			case tea.KeyDown:
				if m.SessionIdx < len(m.Sessions)-1 {
					m.SessionIdx++
				}
			case tea.KeyEnter:
				m.Config.Model = m.Sessions[m.SessionIdx]
				m.LogBuffer = append(m.LogBuffer, fmt.Sprintf("System: Switched model to %s", m.Config.Model))
				m.CurrentView = ViewChat
			}
			return m, nil
		}
```

- [x] **Step 4: Update View() method to render the model list**

```go
	case ViewModelSelect:
		return "\n" + RenderModelSelector(m.Sessions, m.SessionIdx)
```

- [x] **Step 5: Run tests and verify compile success**

Run: `CGO_ENABLED=0 conda run -n go_env go test ./... -v`
Expected: PASS

---

### Task 2: Implement File reading tool (`read_file`) matching TS spec

**Files:**
- Create: `internal/tools/read.go`
- Modify: `internal/tools/executor.go`

- [x] **Step 1: Write file reader tool supporting startLine, endLine, and offset**

Create `internal/tools/read.go` with full specification:
```go
package tools

import (
	"errors"
	"io"
	"os"
	"strings"
)

func ReadFileTool(filePath string, startLine int, endLine int, offset int) (string, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return "", err
	}
	defer file.Close()

	// Simple check for text content
	stat, err := file.Stat()
	if err != nil {
		return "", err
	}
	if stat.IsDir() {
		return "", errors.New("cannot read a directory as a file")
	}

	data, err := io.ReadAll(file)
	if err != nil {
		return "", err
	}

	content := string(data)
	if offset > 0 && offset < len(content) {
		content = content[offset:]
	}

	lines := strings.Split(content, "\n")
	if startLine > 0 && endLine >= startLine {
		if startLine > len(lines) {
			return "", errors.New("start line exceeds file lines count")
		}
		if endLine > len(lines) {
			endLine = len(lines)
		}
		content = strings.Join(lines[startLine-1:endLine], "\n")
	}

	return content, nil
}
```

- [x] **Step 2: Register read_file in ToolRegistry**

Verify tool runs correctly under Go tests.

---

### Task 3: Implement multi_replace_file_content and ask_question

**Files:**
- Modify: `internal/tools/file.go`
- Modify: `internal/tools/executor.go`

- [x] **Step 1: Add chunk structure and MultiReplace function in file.go**

```go
type ReplacementChunk struct {
	TargetContent      string `json:"targetContent"`
	ReplacementContent string `json:"replacementContent"`
	StartLine          int    `json:"startLine"`
	EndLine            int    `json:"endLine"`
}

func MultiReplaceFileContent(filePath string, chunks []ReplacementChunk) error {
	for _, chunk := range chunks {
		err := ReplaceFileContent(filePath, chunk.TargetContent, chunk.ReplacementContent, chunk.StartLine, chunk.EndLine)
		if err != nil {
			return err
		}
	}
	return nil
}
```

- [x] **Step 2: Run all tests**

Run: `CGO_ENABLED=0 conda run -n go_env go test ./... -v`
Expected: PASS

---
