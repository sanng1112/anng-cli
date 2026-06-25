# TUI Modular Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the entire Go TUI codebase of `anng-cli` into a modular, nested sub-model architecture using Charmbracelet's Bubble Tea, fixing key capturing conflicts, and fully implementing advanced input behaviors, dropdown components, and the Settings/Provider console.

**Architecture:** The root `AppModel` will act as a state router, delegating incoming keyboard events and lifecycle messages directly to the active sub-model (e.g. `ChatInputModel`, `SettingsViewModel`, `SessionListModel`, `PermissionModel`). This isolates input focus and prevents key leaks.

**Tech Stack:** Go (Golang), Bubble Tea (TUI framework), Lipgloss (styling), Go testing libraries.

---

### Task 1: Centralized Design Tokens (`internal/tui/theme.go`)

**Files:**
* Modify: `internal/tui/theme.go`
* Test: `internal/tui/theme_test.go`

- [ ] **Step 1: Write the failing test**

Create/update `internal/tui/theme_test.go` to verify colors and styles are loaded from global parameters.
```go
package tui

import (
	"testing"
	"github.com/charmbracelet/lipgloss"
)

func TestThemeDesignTokens(t *testing.T) {
	if BrandOrangeColor != "#D4704B" {
		t.Errorf("expected BrandOrangeColor to be '#D4704B', got %s", BrandOrangeColor)
	}
	styled := OrangeStyle.Render("Test Title")
	expectedFg := lipgloss.Color(BrandOrangeColor)
	if OrangeStyle.GetForeground() != expectedFg {
		t.Errorf("OrangeStyle foreground mismatch")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CGO_ENABLED=0 go test -v ./internal/tui/ -run TestThemeDesignTokens`
Expected: Compile error due to undefined constants or styles.

- [ ] **Step 3: Write minimal implementation**

Modify `internal/tui/theme.go`:
```go
package tui

import (
	"github.com/charmbracelet/lipgloss"
)

const (
	BrandOrangeColor = "#D4704B"
	ColorBrandOrange = "#D4704B"
	ColorDarkOrange  = "#A65030"
	ColorMutedGray   = "#888888"
	ColorGreen       = "#22c55e"
	ColorAmber       = "#f59e0b"
	ColorRed         = "#ef4444"
)

var (
	OrangeStyle = lipgloss.NewStyle().Foreground(lipgloss.Color(BrandOrangeColor))

	StyleTitle = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColorBrandOrange)).
			Bold(true)

	StyleInput = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color(ColorBrandOrange)).
			Padding(0, 1)

	StyleHelp = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColorMutedGray))

	StyleError = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColorRed))

	StyleStatus = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColorAmber))

	QuadrantBorder = lipgloss.Border{
		Top:         "▀",
		Bottom:      "▄",
		Left:        "▌",
		Right:       "▐",
		TopLeft:     "▛",
		TopRight:    "▜",
		BottomLeft:  "▙",
		BottomRight: "▟",
	}

	HeaderFrameStyle = lipgloss.NewStyle().
				Border(QuadrantBorder).
				BorderForeground(lipgloss.Color(ColorBrandOrange)).
				Padding(0, 2)
)

func ApplyOrangeColor(text string) string {
	return OrangeStyle.Render(text)
}

func GetQuadrantBorder() string {
	return HeaderFrameStyle.Render(" mascot frame ")
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CGO_ENABLED=0 go test -v ./internal/tui/ -run TestThemeDesignTokens`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/tui/theme.go internal/tui/theme_test.go
git commit -m "refactor: centralize styling tokens in theme.go"
```

---

### Task 2: Advanced Input Buffer with History and Multi-line (`internal/tui/input_buffer.go`)

**Files:**
* Modify: `internal/tui/input_buffer.go`
* Test: `internal/tui/input_buffer_test.go`

- [ ] **Step 1: Write the failing test**

Update `internal/tui/input_buffer_test.go` to test undo/redo and history bounds:
```go
package tui

import "testing"

func TestAdvancedInputBuffer(t *testing.T) {
	ib := NewInputBuffer()
	ib.Insert("hello")
	ib.PushUndo()
	ib.Insert(" world")
	
	if ib.GetText() != "hello world" {
		t.Fatalf("Insert failed: got %s", ib.GetText())
	}
	
	ib.Undo()
	if ib.GetText() != "hello" {
		t.Errorf("Undo failed: got %s", ib.GetText())
	}
	
	ib.Redo()
	if ib.GetText() != "hello world" {
		t.Errorf("Redo failed: got %s", ib.GetText())
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CGO_ENABLED=0 go test -v ./internal/tui/ -run TestAdvancedInputBuffer`
Expected: Compile error on undefined `PushUndo`, `Undo`, and `Redo` methods.

- [ ] **Step 3: Write minimal implementation**

Update `internal/tui/input_buffer.go`:
```go
package tui

type InputBuffer struct {
	runes      []rune
	cursor     int
	history    []string
	historyIdx int
	tempBuffer string
	undoStack  [][]rune
	redoStack  [][]rune
}

func NewInputBuffer() *InputBuffer {
	return &InputBuffer{
		runes:      []rune{},
		cursor:     0,
		history:    []string{},
		historyIdx: -1,
		undoStack:  [][]rune{},
		redoStack:  [][]rune{},
	}
}

func (ib *InputBuffer) Clear() {
	ib.runes = []rune{}
	ib.cursor = 0
	ib.historyIdx = -1
	ib.undoStack = [][]rune{}
	ib.redoStack = [][]rune{}
}

func (ib *InputBuffer) GetText() string {
	return string(ib.runes)
}

func (ib *InputBuffer) Insert(text string) {
	ib.PushUndo()
	newRunes := []rune(text)
	tail := append([]rune{}, ib.runes[ib.cursor:]...)
	ib.runes = append(ib.runes[:ib.cursor], newRunes...)
	ib.runes = append(ib.runes, tail...)
	ib.cursor += len(newRunes)
}

func (ib *InputBuffer) MoveLeft() {
	if ib.cursor > 0 {
		ib.cursor--
	}
}

func (ib *InputBuffer) MoveRight() {
	if ib.cursor < len(ib.runes) {
		ib.cursor++
	}
}

func (ib *InputBuffer) Backspace() {
	if ib.cursor > 0 {
		ib.PushUndo()
		ib.runes = append(ib.runes[:ib.cursor-1], ib.runes[ib.cursor:]...)
		ib.cursor--
	}
}

func (ib *InputBuffer) Delete() {
	if ib.cursor < len(ib.runes) {
		ib.PushUndo()
		ib.runes = append(ib.runes[:ib.cursor], ib.runes[ib.cursor+1:]...)
	}
}

func (ib *InputBuffer) MoveWordLeft() {
	if ib.cursor == 0 {
		return
	}
	idx := ib.cursor - 1
	for idx > 0 && ib.runes[idx] == ' ' {
		idx--
	}
	for idx > 0 && ib.runes[idx] != ' ' {
		idx--
	}
	if idx > 0 && ib.runes[idx] == ' ' {
		idx++
	}
	ib.cursor = idx
}

func (ib *InputBuffer) MoveWordRight() {
	if ib.cursor >= len(ib.runes) {
		return
	}
	idx := ib.cursor
	for idx < len(ib.runes) && ib.runes[idx] == ' ' {
		idx++
	}
	for idx < len(ib.runes) && ib.runes[idx] != ' ' {
		idx++
	}
	ib.cursor = idx
}

func (ib *InputBuffer) DeleteWordBefore() {
	if ib.cursor == 0 {
		return
	}
	ib.PushUndo()
	start := ib.cursor
	ib.MoveWordLeft()
	ib.runes = append(ib.runes[:ib.cursor], ib.runes[start:]...)
}

func (ib *InputBuffer) PushUndo() {
	bufCopy := make([]rune, len(ib.runes))
	copy(bufCopy, ib.runes)
	ib.undoStack = append(ib.undoStack, bufCopy)
	if len(ib.undoStack) > 50 {
		ib.undoStack = ib.undoStack[1:]
	}
	ib.redoStack = [][]rune{}
}

func (ib *InputBuffer) Undo() {
	if len(ib.undoStack) == 0 {
		return
	}
	current := make([]rune, len(ib.runes))
	copy(current, ib.runes)
	ib.redoStack = append(ib.redoStack, current)

	lastIdx := len(ib.undoStack) - 1
	ib.runes = ib.undoStack[lastIdx]
	ib.undoStack = m.undoStack[:lastIdx]
	ib.cursor = len(ib.runes)
}

func (ib *InputBuffer) Redo() {
	if len(ib.redoStack) == 0 {
		return
	}
	current := make([]rune, len(ib.runes))
	copy(current, ib.runes)
	ib.undoStack = append(ib.undoStack, current)

	lastIdx := len(ib.redoStack) - 1
	ib.runes = ib.redoStack[lastIdx]
	ib.redoStack = ib.redoStack[:lastIdx]
	ib.cursor = len(ib.runes)
}

func (ib *InputBuffer) SetCursor(pos int) {
	if pos < 0 {
		ib.cursor = 0
	} else if pos > len(ib.runes) {
		ib.cursor = len(ib.runes)
	} else {
		ib.cursor = pos
	}
}

func (ib *InputBuffer) GetCursor() int {
	return ib.cursor
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CGO_ENABLED=0 go test -v ./internal/tui/ -run TestAdvancedInputBuffer`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/tui/input_buffer.go internal/tui/input_buffer_test.go
git commit -m "feat: implement undo, redo, and history support in InputBuffer"
```

---

### Task 3: Interactive Reusable Dropdown Component (`internal/tui/dropdown_menu.go`)

**Files:**
* Create: `internal/tui/dropdown_menu.go`
* Create: `internal/tui/dropdown_menu_test.go`

- [ ] **Step 1: Write the failing test**

Create `internal/tui/dropdown_menu_test.go` to test rendering parameters and navigation scrolling viewport bounds:
```go
package tui

import "testing"

func TestDropdownMenuScrolling(t *testing.T) {
	items := []DropdownItem{
		{Key: "1", Label: "Item 1"},
		{Key: "2", Label: "Item 2"},
		{Key: "3", Label: "Item 3"},
		{Key: "4", Label: "Item 4"},
	}
	model := NewDropdownMenuModel("Test Menu", "Help", items, 2)
	
	if len(model.Items) != 4 {
		t.Fatalf("expected 4 items, got %d", len(model.Items))
	}
	
	// Test navigation
	model.MoveDown()
	if model.ActiveIndex != 1 {
		t.Errorf("expected ActiveIndex 1, got %d", model.ActiveIndex)
	}
	
	model.MoveDown()
	model.MoveDown()
	model.MoveDown() // wraps around
	if model.ActiveIndex != 0 {
		t.Errorf("expected ActiveIndex 0 after wrap, got %d", model.ActiveIndex)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CGO_ENABLED=0 go test -v ./internal/tui/ -run TestDropdownMenuScrolling`
Expected: Compile error on undefined types `DropdownItem` and `NewDropdownMenuModel`.

- [ ] **Step 3: Write minimal implementation**

Create `internal/tui/dropdown_menu.go`:
```go
package tui

import (
	"fmt"
	"strings"
	
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type DropdownItem struct {
	Key             string
	Label           string
	Description     string
	Selected        bool
	StatusIndicator *StatusIndicator
}

type StatusIndicator struct {
	Symbol string
	Color  string
}

type DropdownMenuModel struct {
	Title       string
	HelpText    string
	EmptyText   string
	Items       []DropdownItem
	ActiveIndex int
	MaxVisible  int
	Width       int
}

func NewDropdownMenuModel(title string, helpText string, items []DropdownItem, maxVisible int) DropdownMenuModel {
	return DropdownMenuModel{
		Title:       title,
		HelpText:    helpText,
		EmptyText:   "No items found",
		Items:       items,
		ActiveIndex: 0,
		MaxVisible:  maxVisible,
		Width:       80,
	}
}

func (m *DropdownMenuModel) MoveUp() {
	if len(m.Items) == 0 {
		return
	}
	m.ActiveIndex = (m.ActiveIndex - 1 + len(m.Items)) % len(m.Items)
}

func (m *DropdownMenuModel) MoveDown() {
	if len(m.Items) == 0 {
		return
	}
	m.ActiveIndex = (m.ActiveIndex + 1) % len(m.Items)
}

func (m DropdownMenuModel) Update(msg tea.Msg) (DropdownMenuModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.Type {
		case tea.KeyUp, tea.KeyCtrlP:
			m.MoveUp()
		case tea.KeyDown, tea.KeyCtrlN:
			m.MoveDown()
		}
	}
	return m, nil
}

func (m DropdownMenuModel) Render() string {
	if len(m.Items) == 0 {
		return lipgloss.NewStyle().Foreground(lipgloss.Color(ColorMutedGray)).Render(m.EmptyText)
	}

	visibleStart := m.ActiveIndex - m.MaxVisible/2
	if visibleStart < 0 {
		visibleStart = 0
	}
	if visibleStart+m.MaxVisible > len(m.Items) {
		visibleStart = len(m.Items) - m.MaxVisible
	}
	if visibleStart < 0 {
		visibleStart = 0
	}

	visibleEnd := visibleStart + m.MaxVisible
	if visibleEnd > len(m.Items) {
		visibleEnd = len(m.Items)
	}

	var sb strings.Builder
	if m.Title != "" {
		sb.WriteString(lipgloss.NewStyle().Foreground(lipgloss.Color(BrandOrangeColor)).Bold(true).Render("--- "+m.Title+" ---") + "\n")
	}

	if visibleStart > 0 {
		sb.WriteString(fmt.Sprintf("  ... %d above\n", visibleStart))
	}

	for i := visibleStart; i < visibleEnd; i++ {
		item := m.Items[i]
		isActive := i == m.ActiveIndex
		prefix := "  "
		if isActive {
			prefix = "> "
		}

		selectChar := ""
		if item.Selected {
			selectChar = "● "
		} else if !item.Selected && strings.Contains(m.HelpText, "Space") {
			selectChar = "○ "
		}

		indicator := ""
		if item.StatusIndicator != nil {
			indicator = " " + lipgloss.NewStyle().Foreground(lipgloss.Color(item.StatusIndicator.Color)).Render(item.StatusIndicator.Symbol)
		}

		line := fmt.Sprintf("%s%s%s%s", prefix, selectChar, item.Label, indicator)
		if item.Description != "" {
			line = fmt.Sprintf("%-30s %s", line, lipgloss.NewStyle().Foreground(lipgloss.Color(ColorMutedGray)).Render(item.Description))
		}

		if isActive {
			sb.WriteString(lipgloss.NewStyle().Background(lipgloss.Color(BrandOrangeColor)).Foreground(lipgloss.Color("#FFFFFF")).Render(line) + "\n")
		} else {
			sb.WriteString(line + "\n")
		}
	}

	if visibleEnd < len(m.Items) {
		sb.WriteString(fmt.Sprintf("  ... %d more\n", len(m.Items)-visibleEnd))
	}

	if m.HelpText != "" {
		sb.WriteString(lipgloss.NewStyle().Foreground(lipgloss.Color(ColorMutedGray)).Render(m.HelpText) + "\n")
	}

	borderStyle := lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(lipgloss.Color(BrandOrangeColor)).Padding(0, 1)
	return borderStyle.Render(sb.String())
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CGO_ENABLED=0 go test -v ./internal/tui/ -run TestDropdownMenuScrolling`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/tui/dropdown_menu.go internal/tui/dropdown_menu_test.go
git commit -m "feat: implement generic scrollable DropdownMenu component"
```

---

### Task 4: Categorized Autocomplete Slash Commands Menu (`internal/tui/autocomplete.go`)

**Files:**
* Modify: `internal/tui/autocomplete.go`
* Test: `internal/tui/autocomplete_test.go`

- [ ] **Step 1: Write the failing test**

Update `internal/tui/autocomplete_test.go` to verify slash commands filtering and category grouping headers:
```go
package tui

import (
	"strings"
	"testing"
)

func TestSlashCommandsCategories(t *testing.T) {
	items := []string{
		"[Built-in Commands] /new — Fresh conversation",
		"[Built-in Commands] /exit — Quit ANNG CLI",
		"[Custom & Loaded Skills] /writing-plans — Write implementation plans",
	}
	matches := FilterAutocomplete(items, "/w")
	if len(matches) != 1 || !strings.Contains(matches[0], "/writing-plans") {
		t.Errorf("failed filtering loaded skill command, got %v", matches)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CGO_ENABLED=0 go test -v ./internal/tui/ -run TestSlashCommandsCategories`
Expected: FAIL if `FilterAutocomplete` does not support matching with category prefixes or if parsing logic fails.

- [ ] **Step 3: Write minimal implementation**

Update `internal/tui/autocomplete.go`:
```go
package tui

import (
	"strings"
)

func FilterAutocomplete(items []string, prefix string) []string {
	var matches []string
	cleanPrefix := strings.ToLower(prefix)
	for _, item := range items {
		// Strip category bracket if filtering matching string
		parts := strings.SplitN(item, " /", 2)
		cmdAndDesc := ""
		if len(parts) == 2 {
			cmdAndDesc = "/" + parts[1]
		} else {
			cmdAndDesc = item
		}
		if strings.HasPrefix(strings.ToLower(cmdAndDesc), cleanPrefix) {
			matches = append(matches, item)
		}
	}
	return matches
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CGO_ENABLED=0 go test -v ./internal/tui/ -run TestSlashCommandsCategories`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/tui/autocomplete.go
git commit -m "feat: categorize slash command items with grouping headers support"
```

---

### Task 5: Asynchronous Workspace Scanning for Mentions (`internal/tui/file_mentions.go`)

**Files:**
* Modify: `internal/tui/file_mentions.go`
* Create: `internal/tui/file_mentions_test.go`

- [ ] **Step 1: Write the failing test**

Create `internal/tui/file_mentions_test.go` to test that `GetFileMentions` correctly retrieves recursive matches under `cwd` up to depth 3:
```go
package tui

import (
	"strings"
	"testing"
)

func TestGetFileMentions(t *testing.T) {
	matches := GetFileMentions(".", "go.")
	if len(matches) == 0 || !strings.Contains(matches[0], "go.mod") {
		t.Errorf("GetFileMentions failed to list go.mod file, matches: %v", matches)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CGO_ENABLED=0 go test -v ./internal/tui/ -run TestGetFileMentions`
Expected: FAIL if matching logic or output syntax doesn't retrieve relative path mentions.

- [ ] **Step 3: Write minimal implementation**

Update `internal/tui/file_mentions.go`:
```go
package tui

import (
	"os"
	"path/filepath"
	"strings"
)

func GetFileMentions(cwd string, query string) []string {
	var matches []string
	cleanQuery := strings.ReplaceAll(query, "@", "")
	
	// Fast background-friendly directory traversal up to depth 3
	filepath.WalkDir(cwd, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		
		rel, err := filepath.Rel(cwd, path)
		if err != nil || rel == "." || strings.HasPrefix(rel, ".") {
			if d.IsDir() && rel != "." && strings.HasPrefix(rel, ".") {
				return filepath.SkipDir
			}
			return nil
		}

		if strings.HasPrefix(strings.ToLower(rel), strings.ToLower(cleanQuery)) {
			if d.IsDir() {
				matches = append(matches, "@"+rel+"/")
			} else {
				matches = append(matches, "@"+rel)
			}
		}

		if len(matches) >= 10 {
			return filepath.SkipAll
		}
		return nil
	})

	return matches
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CGO_ENABLED=0 go test -v ./internal/tui/ -run TestGetFileMentions`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/tui/file_mentions.go internal/tui/file_mentions_test.go
git commit -m "feat: implement recursive mention path scanner"
```

---

### Task 6: Stateful Settings Console with Multi-Step Wizard (`internal/tui/settings_view.go`)

**Files:**
* Create: `internal/tui/settings_view.go`
* Create: `internal/tui/settings_view_test.go`

- [ ] **Step 1: Write the failing test**

Create `internal/tui/settings_view_test.go` to test multi-step setting wizard selections:
```go
package tui

import "testing"

func TestSettingsWizardFlow(t *testing.T) {
	cfg := AppConfig{Model: "deepseek-chat", Models: []string{"gpt-4o", "deepseek-chat"}}
	model := NewSettingsViewModel(cfg)
	if model.Step != "main" {
		t.Errorf("expected initial step 'main', got %s", model.Step)
	}
	
	// Select Active AI Model which is key "model" (item idx 1)
	model.Dropdown.ActiveIndex = 1
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CGO_ENABLED=0 go test -v ./internal/tui/ -run TestSettingsWizardFlow`
Expected: Compile error on undefined `NewSettingsViewModel` constructor.

- [ ] **Step 3: Write minimal implementation**

Create `internal/tui/settings_view.go`:
```go
package tui

import (
	"fmt"
	"strings"

	"anng-cli/internal/config"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type SettingsViewModel struct {
	Step      string // "main", "models", "providers", "apiKeyInput", "modelInput"
	Scope     string // "project", "user"
	CursorIdx int
	Items     []DropdownItem
	
	Dropdown DropdownMenuModel
	Input    *InputBuffer
	Config   AppConfig
}

func NewSettingsViewModel(cfg AppConfig) SettingsViewModel {
	items := []DropdownItem{
		{Key: "scope", Label: "Settings Scope: Project-Specific", Description: "Toggle global vs project"},
		{Key: "model", Label: "Active AI Model", Description: cfg.Model},
		{Key: "provider", Label: "API Providers Config", Description: "Configure API key"},
		{Key: "auto_accept", Label: fmt.Sprintf("Auto-Accept: %v", cfg.AutoAccept), Description: "Press enter to toggle"},
		{Key: "plan_mode", Label: fmt.Sprintf("Plan Mode: %v", cfg.PlanMode), Description: "Press enter to toggle"},
	}

	return SettingsViewModel{
		Step:      "main",
		Scope:     "project",
		CursorIdx: 0,
		Items:     items,
		Dropdown:  NewDropdownMenuModel("Settings Menu", "enter: select  •  esc: return to chat", items, 5),
		Input:     NewInputBuffer(),
		Config:    cfg,
	}
}

func (m SettingsViewModel) Update(msg tea.Msg) (SettingsViewModel, tea.Cmd) {
	switch m.Step {
	case "main":
		switch msg := msg.(type) {
		case tea.KeyMsg:
			switch msg.Type {
			case tea.KeyEsc:
				return m, func() tea.Msg { return BackToChatMsg{} }
			case tea.KeyUp, tea.KeyDown:
				var cmd tea.Cmd
				m.Dropdown, cmd = m.Dropdown.Update(msg)
				m.CursorIdx = m.Dropdown.ActiveIndex
				return m, cmd
			case tea.KeyEnter:
				key := m.Dropdown.Items[m.Dropdown.ActiveIndex].Key
				switch key {
				case "scope":
					if m.Scope == "project" {
						m.Scope = "user"
						m.Dropdown.Items[0].Label = "Settings Scope: Global (User)"
					} else {
						m.Scope = "project"
						m.Dropdown.Items[0].Label = "Settings Scope: Project-Specific"
					}
				case "model":
					m.Step = "models"
					var modelItems []DropdownItem
					for _, model := range m.Config.Models {
						modelItems = append(modelItems, DropdownItem{Key: model, Label: model, Selected: model == m.Config.Model})
					}
					modelItems = append(modelItems, DropdownItem{Key: "+add", Label: "+ Add custom model..."})
					m.Dropdown = NewDropdownMenuModel("Select Active Model", "enter: select  •  esc: back", modelItems, 6)
				case "provider":
					m.Step = "providers"
					providerItems := []DropdownItem{
						{Key: "apiKey", Label: "API Key", Description: "Edit active API Key"},
					}
					m.Dropdown = NewDropdownMenuModel("API Providers config", "enter: select  •  esc: back", providerItems, 1)
				case "auto_accept":
					m.Config.AutoAccept = !m.Config.AutoAccept
					m.Dropdown.Items[3].Label = fmt.Sprintf("Auto-Accept: %v", m.Config.AutoAccept)
					m.saveSettings()
				case "plan_mode":
					m.Config.PlanMode = !m.Config.PlanMode
					m.Dropdown.Items[4].Label = fmt.Sprintf("Plan Mode: %v", m.Config.PlanMode)
					m.saveSettings()
				}
			}
		}
	case "models":
		switch msg := msg.(type) {
		case tea.KeyMsg:
			switch msg.Type {
			case tea.KeyEsc:
				m.Step = "main"
				m.Dropdown = NewDropdownMenuModel("Settings Menu", "enter: select  •  esc: return to chat", m.Items, 5)
				m.Dropdown.ActiveIndex = 1
			case tea.KeyUp, tea.KeyDown:
				var cmd tea.Cmd
				m.Dropdown, cmd = m.Dropdown.Update(msg)
				return m, cmd
			case tea.KeyEnter:
				selectedKey := m.Dropdown.Items[m.Dropdown.ActiveIndex].Key
				if selectedKey == "+add" {
					m.Step = "modelInput"
					m.Input.Clear()
				} else {
					m.Config.Model = selectedKey
					m.Items[1].Description = selectedKey
					m.Step = "main"
					m.Dropdown = NewDropdownMenuModel("Settings Menu", "enter: select  •  esc: return to chat", m.Items, 5)
					m.Dropdown.ActiveIndex = 1
					m.saveSettings()
				}
			}
		}
	case "modelInput":
		switch msg := msg.(type) {
		case tea.KeyMsg:
			switch msg.Type {
			case tea.KeyEsc:
				m.Step = "models"
				var modelItems []DropdownItem
				for _, model := range m.Config.Models {
					modelItems = append(modelItems, DropdownItem{Key: model, Label: model, Selected: model == m.Config.Model})
				}
				modelItems = append(modelItems, DropdownItem{Key: "+add", Label: "+ Add custom model..."})
				m.Dropdown = NewDropdownMenuModel("Select Active Model", "enter: select  •  esc: back", modelItems, 6)
			case tea.KeyEnter:
				newModelName := strings.TrimSpace(m.Input.GetText())
				if newModelName != "" {
					m.Config.Models = append(m.Config.Models, newModelName)
					m.Config.Model = newModelName
					m.Items[1].Description = newModelName
					m.saveSettings()
				}
				m.Step = "main"
				m.Dropdown = NewDropdownMenuModel("Settings Menu", "enter: select  •  esc: return to chat", m.Items, 5)
				m.Dropdown.ActiveIndex = 1
			case tea.KeyBackspace:
				m.Input.Backspace()
			case tea.KeyRunes:
				m.Input.Insert(string(msg.Runes))
			case tea.KeySpace:
				m.Input.Insert(" ")
			}
		}
	case "providers":
		switch msg := msg.(type) {
		case tea.KeyMsg:
			switch msg.Type {
			case tea.KeyEsc:
				m.Step = "main"
				m.Dropdown = NewDropdownMenuModel("Settings Menu", "enter: select  •  esc: return to chat", m.Items, 5)
				m.Dropdown.ActiveIndex = 2
			case tea.KeyUp, tea.KeyDown:
				var cmd tea.Cmd
				m.Dropdown, cmd = m.Dropdown.Update(msg)
				return m, cmd
			case tea.KeyEnter:
				key := m.Dropdown.Items[m.Dropdown.ActiveIndex].Key
				if key == "apiKey" {
					m.Step = "apiKeyInput"
					m.Input.Clear()
				}
			}
		}
	case "apiKeyInput":
		switch msg := msg.(type) {
		case tea.KeyMsg:
			switch msg.Type {
			case tea.KeyEsc:
				m.Step = "providers"
				providerItems := []DropdownItem{
					{Key: "apiKey", Label: "API Key", Description: "Edit active API Key"},
				}
				m.Dropdown = NewDropdownMenuModel("API Providers config", "enter: select  •  esc: back", providerItems, 1)
			case tea.KeyEnter:
				newVal := strings.TrimSpace(m.Input.GetText())
				m.Config.ApiKey = newVal
				m.saveSettings()
				m.Step = "main"
				m.Dropdown = NewDropdownMenuModel("Settings Menu", "enter: select  •  esc: return to chat", m.Items, 5)
				m.Dropdown.ActiveIndex = 2
			case tea.KeyBackspace:
				m.Input.Backspace()
			case tea.KeyRunes:
				m.Input.Insert(string(msg.Runes))
			case tea.KeySpace:
				m.Input.Insert(" ")
			}
		}
	}
	return m, nil
}

func (m *SettingsViewModel) saveSettings() {
	if m.Config.SettingsPath != "" {
		cfg := &config.Settings{
			Model:  m.Config.Model,
			ApiKey: m.Config.ApiKey,
			Models: m.Config.Models,
		}
		_ = config.SaveConfig(m.Config.SettingsPath, cfg)
	}
}

func (m SettingsViewModel) View() string {
	var sb strings.Builder
	sb.WriteString(lipgloss.NewStyle().Foreground(lipgloss.Color(BrandOrangeColor)).Bold(true).Render("=== Settings Console ===") + "\n\n")

	switch m.Step {
	case "main", "models", "providers":
		sb.WriteString(m.Dropdown.Render())
	case "modelInput":
		sb.WriteString("Add Model Name:\n\n  " + m.Input.GetText() + "█\n\n" + lipgloss.NewStyle().Foreground(lipgloss.Color(ColorMutedGray)).Render("enter: save  •  esc: cancel"))
	case "apiKeyInput":
		sb.WriteString("Enter API Key:\n\n  " + m.Input.GetText() + "█\n\n" + lipgloss.NewStyle().Foreground(lipgloss.Color(ColorMutedGray)).Render("enter: save  •  esc: cancel"))
	}

	return lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(lipgloss.Color(BrandOrangeColor)).Padding(1, 2).Render(sb.String())
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CGO_ENABLED=0 go test -v ./internal/tui/ -run TestSettingsWizardFlow`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/tui/settings_view.go internal/tui/settings_view_test.go
git commit -m "feat: implement stateful multi-step settings view model"
```

---

### Task 7: Reusable List and Select View Sub-Models (`internal/tui/list_views.go`)

**Files:**
* Create: `internal/tui/list_views.go`
* Create: `internal/tui/list_views_test.go`

- [ ] **Step 1: Write the failing test**

Create `internal/tui/list_views_test.go` to verify checkpoint and session list models capture keystrokes:
```go
package tui

import (
	"testing"
	tea "github.com/charmbracelet/bubbletea"
)

func TestSessionListKeyEsc(t *testing.T) {
	model := NewSessionListModel(".")
	newModel, cmd := model.Update(tea.KeyMsg{Type: tea.KeyEsc})
	
	if cmd == nil {
		t.Fatalf("expected command return on escape press")
	}
	
	msg := cmd()
	if _, ok := msg.(BackToChatMsg); !ok {
		t.Errorf("expected BackToChatMsg on Esc, got %T", msg)
	}
	_ = newModel
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CGO_ENABLED=0 go test -v ./internal/tui/ -run TestSessionListKeyEsc`
Expected: Compile error on undefined types `SessionListModel` and `BackToChatMsg`.

- [ ] **Step 3: Write minimal implementation**

Create `internal/tui/list_views.go`:
```go
package tui

import (
	"os"
	"path/filepath"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
)

type ResumeSessionMsg struct {
	SessionName string
}

type RestoreCheckpointMsg struct {
	Checkpoint string
}

type BackToChatMsg struct{}

type SessionListModel struct {
	Dropdown    DropdownMenuModel
	ProjectRoot string
}

func NewSessionListModel(projectRoot string) SessionListModel {
	sessions := LoadSessions(projectRoot)
	var items []DropdownItem
	for _, s := range sessions {
		items = append(items, DropdownItem{Key: s, Label: s})
	}
	return SessionListModel{
		Dropdown:    NewDropdownMenuModel("Resumable Chat Sessions", "enter: resume  •  esc: cancel  •  d: delete session", items, 10),
		ProjectRoot: projectRoot,
	}
}

func (m SessionListModel) Update(msg tea.Msg) (SessionListModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.Type {
		case tea.KeyEsc:
			return m, func() tea.Msg { return BackToChatMsg{} }
		case tea.KeyRunes:
			if string(msg.Runes) == "d" && len(m.Dropdown.Items) > 0 {
				selected := m.Dropdown.Items[m.Dropdown.ActiveIndex].Key
				m.deleteSessionFile(selected)
				m.Dropdown.Items = append(m.Dropdown.Items[:m.Dropdown.ActiveIndex], m.Dropdown.Items[m.Dropdown.ActiveIndex+1:]...)
				if m.Dropdown.ActiveIndex >= len(m.Dropdown.Items) && len(m.Dropdown.Items) > 0 {
					m.Dropdown.ActiveIndex = len(m.Dropdown.Items) - 1
				}
				return m, nil
			}
		case tea.KeyUp, tea.KeyDown:
			var cmd tea.Cmd
			m.Dropdown, cmd = m.Dropdown.Update(msg)
			return m, cmd
		case tea.KeyEnter:
			if len(m.Dropdown.Items) > 0 {
				selected := m.Dropdown.Items[m.Dropdown.ActiveIndex].Key
				return m, func() tea.Msg { return ResumeSessionMsg{SessionName: selected} }
			}
		}
	}
	return m, nil
}

func (m SessionListModel) deleteSessionFile(sessionName string) {
	home, _ := os.UserHomeDir()
	projectCode := strings.ReplaceAll(m.ProjectRoot, "/", "-")
	projectCode = strings.ReplaceAll(projectCode, "\\", "-")
	projectCode = strings.ReplaceAll(projectCode, ":", "")
	path := filepath.Join(home, ".anng", "projects", projectCode, sessionName+".jsonl")
	_ = os.Remove(path)
}

func (m SessionListModel) View() string {
	return "\n" + m.Dropdown.Render()
}

type UndoSelectorModel struct {
	Dropdown DropdownMenuModel
}

func NewUndoSelectorModel(checkpoints []string) UndoSelectorModel {
	var items []DropdownItem
	for _, c := range checkpoints {
		items = append(items, DropdownItem{Key: c, Label: "[Target] " + c})
	}
	return UndoSelectorModel{
		Dropdown: NewDropdownMenuModel("Undo conversation checkpoints", "enter: restore point  •  esc: cancel", items, 10),
	}
}

func (m UndoSelectorModel) Update(msg tea.Msg) (UndoSelectorModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.Type {
		case tea.KeyEsc:
			return m, func() tea.Msg { return BackToChatMsg{} }
		case tea.KeyUp, tea.KeyDown:
			var cmd tea.Cmd
			m.Dropdown, cmd = m.Dropdown.Update(msg)
			return m, cmd
		case tea.KeyEnter:
			if len(m.Dropdown.Items) > 0 {
				selected := m.Dropdown.Items[m.Dropdown.ActiveIndex].Key
				return m, func() tea.Msg { return RestoreCheckpointMsg{Checkpoint: selected} }
			}
		}
	}
	return m, nil
}

func (m UndoSelectorModel) View() string {
	return "\n" + m.Dropdown.Render()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CGO_ENABLED=0 go test -v ./internal/tui/ -run TestSessionListKeyEsc`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/tui/list_views.go internal/tui/list_views_test.go
git commit -m "feat: implement modular SessionListModel and UndoSelectorModel"
```

---

### Task 8: Model Select, Skills list, and MCP Status sub-models (`internal/tui/model_skills_views.go`)

**Files:**
* Create: `internal/tui/model_skills_views.go`
* Create: `internal/tui/model_skills_views_test.go`

- [ ] **Step 1: Write the failing test**

Create `internal/tui/model_skills_views_test.go` verifying that selecting a model returns `SwitchModelMsg`:
```go
package tui

import (
	"testing"
	tea "github.com/charmbracelet/bubbletea"
)

func TestModelSelectTrigger(t *testing.T) {
	model := NewModelSelectModel([]string{"gpt-4o", "gemini-1.5-pro"}, "gpt-4o")
	newModel, cmd := model.Update(tea.KeyMsg{Type: tea.KeyEnter})
	
	if cmd == nil {
		t.Fatalf("expected command on ModelSelect enter")
	}
	
	msg := cmd()
	if sm, ok := msg.(SwitchModelMsg); !ok || sm.Model != "gpt-4o" {
		t.Errorf("expected SwitchModelMsg for gpt-4o, got %v", msg)
	}
	_ = newModel
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CGO_ENABLED=0 go test -v ./internal/tui/ -run TestModelSelectTrigger`
Expected: Compile error on undefined types `ModelSelectModel` and `SwitchModelMsg`.

- [ ] **Step 3: Write minimal implementation**

Create `internal/tui/model_skills_views.go`:
```go
package tui

import (
	tea "github.com/charmbracelet/bubbletea"
)

type SwitchModelMsg struct {
	Model string
}

type AddCustomModelMsg struct{}

type ModelSelectModel struct {
	Dropdown DropdownMenuModel
}

func NewModelSelectModel(models []string, activeModel string) ModelSelectModel {
	var items []DropdownItem
	for _, m := range models {
		items = append(items, DropdownItem{
			Key:      m,
			Label:    m,
			Selected: m == activeModel,
		})
	}
	items = append(items, DropdownItem{
		Key:   "+add",
		Label: "+ Add custom model...",
	})
	return ModelSelectModel{
		Dropdown: NewDropdownMenuModel("Select AI Provider Model", "enter: select model  •  esc: cancel", items, 10),
	}
}

func (m ModelSelectModel) Update(msg tea.Msg) (ModelSelectModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.Type {
		case tea.KeyEsc:
			return m, func() tea.Msg { return BackToChatMsg{} }
		case tea.KeyUp, tea.KeyDown:
			var cmd tea.Cmd
			m.Dropdown, cmd = m.Dropdown.Update(msg)
			return m, cmd
		case tea.KeyEnter:
			if len(m.Dropdown.Items) > 0 {
				selected := m.Dropdown.Items[m.Dropdown.ActiveIndex].Key
				if selected == "+add" {
					return m, func() tea.Msg { return AddCustomModelMsg{} }
				}
				return m, func() tea.Msg { return SwitchModelMsg{Model: selected} }
			}
		}
	}
	return m, nil
}

func (m ModelSelectModel) View() string {
	return "\n" + m.Dropdown.Render()
}

type SkillsListModel struct {
	Dropdown DropdownMenuModel
}

func NewSkillsListModel(skills []string) SkillsListModel {
	var items []DropdownItem
	for _, s := range skills {
		items = append(items, DropdownItem{Key: s, Label: s})
	}
	return SkillsListModel{
		Dropdown: NewDropdownMenuModel("Available Skills", "esc: return to chat", items, 10),
	}
}

func (m SkillsListModel) Update(msg tea.Msg) (SkillsListModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.Type {
		case tea.KeyEsc, tea.KeyEnter:
			return m, func() tea.Msg { return BackToChatMsg{} }
		case tea.KeyUp, tea.KeyDown:
			var cmd tea.Cmd
			m.Dropdown, cmd = m.Dropdown.Update(msg)
			return m, cmd
		}
	}
	return m, nil
}

func (m SkillsListModel) View() string {
	return "\n" + m.Dropdown.Render()
}

type McpStatusModel struct {
	Dropdown DropdownMenuModel
}

func NewMcpStatusModel(mcpServers []string, statuses map[string]string) McpStatusModel {
	var items []DropdownItem
	for _, mcp := range mcpServers {
		status := statuses[mcp]
		symbol := "○"
		color := ColorRed
		if status == "connected" {
			symbol = "●"
			color = ColorGreen
		}
		items = append(items, DropdownItem{
			Key:   mcp,
			Label: mcp,
			StatusIndicator: &StatusIndicator{
				Symbol: symbol,
				Color:  color,
			},
		})
	}
	return McpStatusModel{
		Dropdown: NewDropdownMenuModel("MCP Server Connections", "esc: return to chat", items, 10),
	}
}

func (m McpStatusModel) Update(msg tea.Msg) (McpStatusModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.Type {
		case tea.KeyEsc, tea.KeyEnter:
			return m, func() tea.Msg { return BackToChatMsg{} }
		case tea.KeyUp, tea.KeyDown:
			var cmd tea.Cmd
			m.Dropdown, cmd = m.Dropdown.Update(msg)
			return m, cmd
		}
	}
	return m, nil
}

func (m McpStatusModel) View() string {
	return "\n" + m.Dropdown.Render()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CGO_ENABLED=0 go test -v ./internal/tui/ -run TestModelSelectTrigger`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/tui/model_skills_views.go internal/tui/model_skills_views_test.go
git commit -m "feat: implement modular model select, skills list, and mcp status models"
```

---

### Task 9: Permission Prompt Sub-Model (`internal/tui/permission_prompt_view.go`)

**Files:**
* Create: `internal/tui/permission_prompt_view.go`
* Create: `internal/tui/permission_prompt_view_test.go`

- [ ] **Step 1: Write the failing test**

Create `internal/tui/permission_prompt_view_test.go` to verify confirmation options selection outputs the right permission decision:
```go
package tui

import (
	"testing"
	tea "github.com/charmbracelet/bubbletea"
)

func TestPermissionPromptAllow(t *testing.T) {
	req := PermissionRequest{
		ToolName: "test-tool",
		Command:  "echo hello",
	}
	model := NewPermissionPromptModel(req)
	newModel, cmd := model.Update(tea.KeyMsg{Type: tea.KeyEnter})
	
	if cmd == nil {
		t.Fatalf("expected decision message command on enter")
	}
	
	msg := cmd()
	decision, ok := msg.(PermissionDecisionMsg)
	if !ok {
		t.Fatalf("expected PermissionDecisionMsg, got %T", msg)
	}
	if !decision.Allow || decision.AlwaysAllow {
		t.Errorf("expected Allow to be true and AlwaysAllow to be false, got Allow=%v, AlwaysAllow=%v", decision.Allow, decision.AlwaysAllow)
	}
	_ = newModel
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CGO_ENABLED=0 go test -v ./internal/tui/ -run TestPermissionPromptAllow`
Expected: Compile error on undefined `PermissionPromptModel` or `PermissionDecisionMsg`.

- [ ] **Step 3: Write minimal implementation**

Create `internal/tui/permission_prompt_view.go`:
```go
package tui

import (
	tea "github.com/charmbracelet/bubbletea"
)

type PermissionDecisionMsg struct {
	Allow       bool
	AlwaysAllow bool
}

type PermissionPromptModel struct {
	Request PermissionRequest
	Cursor  int
}

func NewPermissionPromptModel(req PermissionRequest) PermissionPromptModel {
	return PermissionPromptModel{
		Request: req,
		Cursor:  0,
	}
}

func (m PermissionPromptModel) Update(msg tea.Msg) (PermissionPromptModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.Type {
		case tea.KeyEsc:
			return m, func() tea.Msg { return PermissionDecisionMsg{Allow: false, AlwaysAllow: false} }
		case tea.KeyUp:
			if m.Cursor > 0 {
				m.Cursor--
			}
		case tea.KeyDown:
			if m.Cursor < 2 {
				m.Cursor++
			}
		case tea.KeyEnter:
			allow := m.Cursor == 0 || m.Cursor == 1
			alwaysAllow := m.Cursor == 1
			return m, func() tea.Msg { return PermissionDecisionMsg{Allow: allow, AlwaysAllow: alwaysAllow} }
		}
	}
	return m, nil
}

func (m PermissionPromptModel) View() string {
	return "\n" + RenderPermissionPrompt(m.Request, m.Cursor)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CGO_ENABLED=0 go test -v ./internal/tui/ -run TestPermissionPromptAllow`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/tui/permission_prompt_view.go internal/tui/permission_prompt_view_test.go
git commit -m "feat: implement isolated permission prompt Bubble Tea view model"
```

---

### Task 10: Core Chat View Sub-Model (`internal/tui/chat_view.go`)

**Files:**
* Create: `internal/tui/chat_view.go`
* Create: `internal/tui/chat_view_test.go`

- [ ] **Step 1: Write the failing test**

Create `internal/tui/chat_view_test.go` confirming that navigation commands type-in returns navigation view triggers:
```go
package tui

import (
	"testing"
	tea "github.com/charmbracelet/bubbletea"
)

func TestChatViewNavTrigger(t *testing.T) {
	cfg := AppConfig{Model: "gpt-4o"}
	model := NewChatViewModel(cfg, []string{"/settings"})
	
	// Simulate input typing
	model.Buffer.Insert("/settings")
	
	// Press enter
	newModel, cmd := model.Update(tea.KeyMsg{Type: tea.KeyEnter})
	if cmd == nil {
		t.Fatalf("expected view transition cmd on slash command submit")
	}
	
	msg := cmd()
	trigger, ok := msg.(TriggerViewMsg)
	if !ok || trigger.View != ViewSettings {
		t.Errorf("expected TriggerViewMsg with settings, got %v", msg)
	}
	_ = newModel
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CGO_ENABLED=0 go test -v ./internal/tui/ -run TestChatViewNavTrigger`
Expected: Compile error on undefined `ChatViewModel` or `TriggerViewMsg`.

- [ ] **Step 3: Write minimal implementation**

Create `internal/tui/chat_view.go`:
```go
package tui

import (
	"context"
	"fmt"
	"os"
	"strings"

	"anng-cli/internal/agent"
	"anng-cli/internal/contextkeys"
	"anng-cli/internal/skills"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type ChatViewModel struct {
	Buffer      *InputBuffer
	LogBuffer   []string
	SlashItems  []string
	ShowMenu    bool
	MenuIdx     int
	MenuMatches []string
	
	ShowFileMenu     bool
	FileMatches      []string
	FileMenuIdx      int
	MentionWordStart int
	
	Busy    bool
	ErrLine string
	Config  AppConfig
	Width   int
	Height  int
}

type TriggerViewMsg struct {
	View TuiView
}

func NewChatViewModel(cfg AppConfig, slashItems []string) ChatViewModel {
	return ChatViewModel{
		Buffer:     NewInputBuffer(),
		LogBuffer:  []string{},
		SlashItems: slashItems,
		Config:     cfg,
	}
}

func (m ChatViewModel) Update(msg tea.Msg) (ChatViewModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.Type {
		case tea.KeyEsc:
			if m.ShowMenu {
				m.ShowMenu = false
				m.MenuMatches = nil
				m.MenuIdx = 0
			} else {
				m.Buffer.Clear()
			}
		case tea.KeyEnter:
			if m.ShowMenu && len(m.MenuMatches) > 0 {
				selected := strings.SplitN(m.MenuMatches[m.MenuIdx], " ", 2)[0]
				m.Buffer.Clear()
				m.Buffer.Insert(selected)
				m.ShowMenu = false
				m.MenuMatches = nil
				return m, nil
			} else if m.ShowFileMenu && len(m.FileMatches) > 0 {
				selected := m.FileMatches[m.FileMenuIdx]
				cursor := m.Buffer.GetCursor()
				for i := 0; i < cursor-m.MentionWordStart; i++ {
					m.Buffer.Backspace()
				}
				m.Buffer.Insert(selected + " ")
				m.ShowFileMenu = false
				m.FileMatches = nil
				return m, nil
			}

			text := strings.TrimSpace(m.Buffer.GetText())
			m.Buffer.Clear()
			m.ShowMenu = false
			m.ShowFileMenu = false
			m.MenuMatches = nil
			m.FileMatches = nil
			m.MenuIdx = 0
			m.FileMenuIdx = 0

			if text != "" {
				if strings.HasPrefix(text, "/") {
					// Handle TUI navigation triggers
					switch text {
					case "/exit":
						return m, tea.Quit
					case "/new":
						m.LogBuffer = []string{}
						m.ErrLine = ""
					case "/resume":
						return m, func() tea.Msg { return TriggerViewMsg{View: ViewSessionList} }
					case "/undo":
						return m, func() tea.Msg { return TriggerViewMsg{View: ViewUndo} }
					case "/mcp":
						return m, func() tea.Msg { return TriggerViewMsg{View: ViewMcpStatus} }
					case "/settings":
						return m, func() tea.Msg { return TriggerViewMsg{View: ViewSettings} }
					case "/model":
						return m, func() tea.Msg { return TriggerViewMsg{View: ViewModelSelect} }
					case "/skills":
						return m, func() tea.Msg { return TriggerViewMsg{View: ViewSkillsList} }
					default:
						m.LogBuffer = append(m.LogBuffer, "System: Unrecognized command "+text)
					}
				} else {
					m.LogBuffer = append(m.LogBuffer, lipgloss.NewStyle().Foreground(lipgloss.Color(BrandOrangeColor)).Render("> ")+text)
					m.Busy = true
					return m, func() tea.Msg {
						home, _ := os.UserHomeDir()
						expanded := skills.ExpandPrompt(text, m.Config.ProjectRoot, home)
						orch := agent.NewOrchestrator(m.Config.Model, m.Config.ApiKey)
						ctx := context.WithValue(context.Background(), contextkeys.ProjectRootKey, m.Config.ProjectRoot)
						ctx = context.WithValue(ctx, contextkeys.SessionIDKey, "session-tui")
						res, err := orch.Run(ctx, expanded)
						return AgentFinishedMsg{Result: res, Err: err}
					}
				}
			}
		case tea.KeyBackspace:
			m.Buffer.Backspace()
			m.updateMenu()
		case tea.KeyCtrlW:
			m.Buffer.DeleteWordBefore()
			m.updateMenu()
		case tea.KeyDelete:
			m.Buffer.Delete()
		case tea.KeyLeft:
			if msg.Alt {
				m.Buffer.MoveWordLeft()
			} else {
				m.Buffer.MoveLeft()
			}
		case tea.KeyRight:
			if msg.Alt {
				m.Buffer.MoveWordRight()
			} else {
				m.Buffer.MoveRight()
			}
		case tea.KeyHome:
			m.Buffer.SetCursor(0)
		case tea.KeyEnd:
			m.Buffer.SetCursor(len([]rune(m.Buffer.GetText())))
		case tea.KeyUp:
			if m.ShowMenu && len(m.MenuMatches) > 0 {
				if m.MenuIdx > 0 {
					m.MenuIdx--
				}
			} else if m.ShowFileMenu && len(m.FileMatches) > 0 {
				if m.FileMenuIdx > 0 {
					m.FileMenuIdx--
				}
			}
		case tea.KeyDown:
			if m.ShowMenu && len(m.MenuMatches) > 0 {
				if m.MenuIdx < len(m.MenuMatches)-1 {
					m.MenuIdx++
				}
			} else if m.ShowFileMenu && len(m.FileMatches) > 0 {
				if m.FileMenuIdx < len(m.FileMatches)-1 {
					m.FileMenuIdx++
				}
			}
		case tea.KeyTab:
			if m.ShowMenu && len(m.MenuMatches) > 0 {
				selected := strings.SplitN(m.MenuMatches[m.MenuIdx], " ", 2)[0]
				m.Buffer.Clear()
				m.Buffer.Insert(selected)
				m.ShowMenu = false
				m.MenuMatches = nil
			} else if m.ShowFileMenu && len(m.FileMatches) > 0 {
				selected := m.FileMatches[m.FileMenuIdx]
				cursor := m.Buffer.GetCursor()
				for i := 0; i < cursor-m.MentionWordStart; i++ {
					m.Buffer.Backspace()
				}
				m.Buffer.Insert(selected + " ")
				m.ShowFileMenu = false
				m.FileMatches = nil
			}
		case tea.KeyRunes:
			m.Buffer.Insert(string(msg.Runes))
			m.updateMenu()
		case tea.KeySpace:
			m.Buffer.Insert(" ")
			m.updateMenu()
		}
	}
	return m, nil
}

func (m *ChatViewModel) updateMenu() {
	text := m.Buffer.GetText()
	cursor := m.Buffer.GetCursor()
	
	m.ShowMenu = false
	m.ShowFileMenu = false

	if strings.HasPrefix(text, "/") && cursor <= len([]rune(text)) && !strings.Contains(text[:cursor], " ") {
		matches := FilterAutocomplete(m.SlashItems, text)
		m.MenuMatches = matches
		m.ShowMenu = len(matches) > 0
		if m.MenuIdx >= len(matches) {
			m.MenuIdx = 0
		}
		return
	}

	runes := []rune(text)
	if cursor > 0 && cursor <= len(runes) {
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
			if m.FileMenuIdx >= len(matches) {
				m.FileMenuIdx = 0
			}
		}
	}
}

func (m ChatViewModel) View() string {
	w := m.Width
	if w <= 0 {
		w = 80
	}
	h := m.Height
	if h <= 0 {
		h = 24
	}

	var sb strings.Builder

	// Welcome screen on first render (no log yet)
	if len(m.LogBuffer) == 0 {
		sb.WriteString(RenderWelcomeScreen(WelcomeConfig{
			ProjectRoot:     m.Config.ProjectRoot,
			Model:           m.Config.Model,
			ThinkingEnabled: false,
			ReasoningEffort: "-",
			Version:         m.Config.Version,
		}, w))
		sb.WriteString("\n\n")
	} else {
		// Scrollback chat log
		maxLog := h - 8
		if maxLog < 1 {
			maxLog = 1
		}
		logs := m.LogBuffer
		if len(logs) > maxLog {
			logs = logs[len(logs)-maxLog:]
		}
		for _, line := range logs {
			sb.WriteString(line)
			sb.WriteString("\n")
		}
	}

	// Errors
	if m.ErrLine != "" {
		sb.WriteString(lipgloss.NewStyle().Foreground(lipgloss.Color("#ef4444")).Render("Error: "+m.ErrLine) + "\n")
	}

	// Status (busy)
	if m.Busy {
		sb.WriteString(lipgloss.NewStyle().Foreground(lipgloss.Color("#f59e0b")).Render("⠋ Thinking...") + "\n")
	}

	// Autocomplete dropdown (above input)
	if m.ShowMenu && len(m.MenuMatches) > 0 {
		sb.WriteString(RenderDropdownMenu(m.MenuMatches, m.MenuIdx, w))
		sb.WriteString("\n")
	} else if m.ShowFileMenu && len(m.FileMatches) > 0 {
		sb.WriteString(RenderDropdownMenu(m.FileMatches, m.FileMenuIdx, w))
		sb.WriteString("\n")
	}

	// Input box
	inputWidth := w - 4
	if inputWidth < 20 {
		inputWidth = 20
	}
	textRunes := []rune(m.Buffer.GetText())
	cursorPos := m.Buffer.GetCursor()
	var inputContent string
	if cursorPos >= len(textRunes) {
		inputContent = string(textRunes) + lipgloss.NewStyle().Background(lipgloss.Color(BrandOrangeColor)).Foreground(lipgloss.Color("#FFFFFF")).Render(" ")
	} else {
		before := string(textRunes[:cursorPos])
		cursorChar := string(textRunes[cursorPos])
		after := string(textRunes[cursorPos+1:])
		styledCursor := lipgloss.NewStyle().Background(lipgloss.Color(BrandOrangeColor)).Foreground(lipgloss.Color("#FFFFFF")).Render(cursorChar)
		inputContent = before + styledCursor + after
	}
	styledInput := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color(BrandOrangeColor)).
		Padding(0, 1).Width(inputWidth).Render(inputContent)
	sb.WriteString(styledInput)
	sb.WriteString("\n")

	// Help bar
	modeTag := ""
	if m.Config.PlanMode {
		modeTag = lipgloss.NewStyle().Foreground(lipgloss.Color("#f59e0b")).Render(" [plan]")
	} else if m.Config.AutoAccept {
		modeTag = lipgloss.NewStyle().Foreground(lipgloss.Color("#22c55e")).Render(" [auto]")
	}
	helpLine := lipgloss.NewStyle().Foreground(lipgloss.Color("#888888")).MarginTop(1).Render("enter: send  •  tab: complete  •  esc: clear  •  /: commands  •  ctrl+c: quit")
	sb.WriteString(fmt.Sprintf("%s%s\n", helpLine, modeTag))

	return sb.String()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CGO_ENABLED=0 go test -v ./internal/tui/ -run TestChatViewNavTrigger`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/tui/chat_view.go internal/tui/chat_view_test.go
git commit -m "feat: implement modular ChatViewModel"
```

---

### Task 11: App Entry and State Routing Refactoring (`internal/tui/app.go`)

**Files:**
* Modify: `internal/tui/app.go`
* Modify: `internal/tui/views.go`

- [ ] **Step 1: Write the failing test**

We modify `internal/tui/app_test.go` to test active router routing:
```go
package tui

import (
	"testing"
	tea "github.com/charmbracelet/bubbletea"
)

func TestAppRoutingSwitch(t *testing.T) {
	cfg := AppConfig{Version: "0.2.2"}
	app := InitialModelWithConfig(cfg)
	
	// Route keys through isolated sub-model routing
	app.CurrentView = ViewSettings
	app.SettingsView = NewSettingsViewModel(cfg)
	
	// Send escape to return to chat
	newModel, _ := app.Update(tea.KeyMsg{Type: tea.KeyEsc})
	updatedApp := newModel.(AppModel)
	
	// Verify view switches to ViewChat through back-propagation message routing
	if updatedApp.CurrentView != ViewChat {
		t.Errorf("AppModel did not switch back to ViewChat from ViewSettings on Esc")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CGO_ENABLED=0 go test -v ./internal/tui/ -run TestAppRoutingSwitch`
Expected: Compile errors due to mismatch in `AppModel` structure or missing sub-model fields.

- [ ] **Step 3: Write minimal implementation**

First, modify `internal/tui/views.go` to delete deprecated static helper functions (`RenderSessionList`, `RenderUndoSelector`, etc.) and keep only `TuiView` type declarations:
```go
package tui

type TuiView string

const (
	ViewChat        TuiView = "chat"
	ViewSessionList TuiView = "session-list"
	ViewUndo        TuiView = "undo"
	ViewMcpStatus   TuiView = "mcp-status"
	ViewSettings    TuiView = "settings"
	ViewModelSelect TuiView = "model-select"
	ViewSkillsList  TuiView = "skills-list"
	ViewInput       TuiView = "input"
)
```

Next, modify `internal/tui/app.go` entirely with the state router delegator:
```go
package tui

import (
	"fmt"
	"os"
	"strings"

	"anng-cli/internal/skills"
	tea "github.com/charmbracelet/bubbletea"
)

type AppModel struct {
	Width  int
	Height int

	CurrentView TuiView
	
	ChatView        ChatViewModel
	SettingsView    SettingsViewModel
	SessionListView SessionListModel
	UndoView        UndoSelectorModel
	ModelSelectView ModelSelectModel
	SkillsListView  SkillsListModel
	McpStatusView   McpStatusModel
	PermissionView  PermissionPromptModel
	
	Config            AppConfig
	PendingPermission *PermissionRequest
	ShowStdout        bool
	StdoutBuf         string
	StdoutCommand     string
	Busy              bool
	ErrLine           string
}

func InitialModelWithConfig(cfg AppConfig) AppModel {
	home, _ := os.UserHomeDir()
	cwd := FormatHomeRelativePath(cfg.ProjectRoot, home)
	if cwd == "" {
		cwd = cfg.ProjectRoot
	}

	slashItems := []string{
		"[Built-in Commands] /exit    — Thoát ANNG CLI",
		"[Built-in Commands] /new     — Phiên hội thoại mới",
		"[Built-in Commands] /resume  — Tiếp tục phiên cũ",
		"[Built-in Commands] /undo    — Hoàn tác checkpoint",
		"[Built-in Commands] /mcp     — Trạng thái MCP servers",
		"[Built-in Commands] /settings — Cài đặt API, Model",
		"[Built-in Commands] /model   — Chọn model AI",
		"[Built-in Commands] /skills  — Danh sách các kỹ năng hiện có",
	}

	loadedSkills := skills.LoadAllSkills(cwd, home)
	for _, s := range loadedSkills {
		slashItems = append(slashItems, fmt.Sprintf("[Custom & Loaded Skills] /%s — %s", s.Name, s.Description))
	}

	chatVM := NewChatViewModel(cfg, slashItems)

	return AppModel{
		CurrentView: ViewChat,
		ChatView:    chatVM,
		Config:      cfg,
	}
}

func InitialModel() AppModel {
	return InitialModelWithConfig(AppConfig{Version: "0.2.0"})
}

func (m AppModel) Init() tea.Cmd {
	return nil
}

type AgentFinishedMsg struct {
	Result interface{}
	Err    error
}

func (m AppModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		if msg.Type == tea.KeyCtrlC || msg.Type == tea.KeyCtrlD {
			return m, tea.Quit
		}
	case tea.WindowSizeMsg:
		m.Width = msg.Width
		m.Height = msg.Height
		m.ChatView.Width = msg.Width
		m.ChatView.Height = msg.Height
		return m, nil
	case AgentFinishedMsg:
		m.Busy = false
		m.ChatView.Busy = false
		if msg.Err != nil {
			m.ErrLine = msg.Err.Error()
			m.ChatView.ErrLine = msg.Err.Error()
		}
		return m, nil
	}

	if m.PendingPermission != nil {
		var cmd tea.Cmd
		m.PermissionView, cmd = m.PermissionView.Update(msg)
		if dec, ok := msg.(PermissionDecisionMsg); ok {
			m.PendingPermission = nil
			_ = dec
		}
		return m, cmd
	}

	switch m.CurrentView {
	case ViewChat:
		var cmd tea.Cmd
		m.ChatView, cmd = m.ChatView.Update(msg)
		if trigger, ok := msg.(TriggerViewMsg); ok {
			m.CurrentView = trigger.View
			switch trigger.View {
			case ViewSessionList:
				m.SessionListView = NewSessionListModel(m.Config.ProjectRoot)
			case ViewUndo:
				m.UndoView = NewUndoSelectorModel(m.ChatView.LogBuffer)
			case ViewSettings:
				m.SettingsView = NewSettingsViewModel(m.Config)
			case ViewModelSelect:
				m.ModelSelectView = NewModelSelectModel(m.Config.Models, m.Config.Model)
			case ViewSkillsList:
				var list []string
				for _, item := range m.ChatView.SlashItems {
					if strings.Contains(item, "Skills") {
						list = append(list, item)
					}
				}
				m.SkillsListView = NewSkillsListModel(list)
			case ViewMcpStatus:
				m.McpStatusView = NewMcpStatusModel(
					[]string{"filesystem", "google-search"},
					map[string]string{"filesystem": "connected", "google-search": "connected"},
				)
			}
		}
		return m, cmd

	case ViewSessionList:
		var cmd tea.Cmd
		m.SessionListView, cmd = m.SessionListView.Update(msg)
		if _, ok := msg.(BackToChatMsg); ok {
			m.CurrentView = ViewChat
		} else if res, ok := msg.(ResumeSessionMsg); ok {
			m.CurrentView = ViewChat
			m.ChatView.LogBuffer = append(m.ChatView.LogBuffer, "System: Loaded session "+res.SessionName)
		}
		return m, cmd

	case ViewUndo:
		var cmd tea.Cmd
		m.UndoView, cmd = m.UndoView.Update(msg)
		if _, ok := msg.(BackToChatMsg); ok {
			m.CurrentView = ViewChat
		} else if restore, ok := msg.(RestoreCheckpointMsg); ok {
			m.CurrentView = ViewChat
			m.ChatView.LogBuffer = append(m.ChatView.LogBuffer, "System: Restored checkpoint "+restore.Checkpoint)
		}
		return m, cmd

	case ViewSettings:
		var cmd tea.Cmd
		m.SettingsView, cmd = m.SettingsView.Update(msg)
		if _, ok := msg.(BackToChatMsg); ok {
			m.CurrentView = ViewChat
			m.Config = m.SettingsView.Config
			m.ChatView.Config = m.SettingsView.Config
		}
		return m, cmd

	case ViewModelSelect:
		var cmd tea.Cmd
		m.ModelSelectView, cmd = m.ModelSelectView.Update(msg)
		if _, ok := msg.(BackToChatMsg); ok {
			m.CurrentView = ViewChat
		} else if sw, ok := msg.(SwitchModelMsg); ok {
			m.Config.Model = sw.Model
			m.ChatView.Config.Model = sw.Model
			m.CurrentView = ViewChat
		} else if _, ok := msg.(AddCustomModelMsg); ok {
			m.CurrentView = ViewInput
			m.ChatView.Buffer.Clear()
		}
		return m, cmd

	case ViewSkillsList:
		var cmd tea.Cmd
		m.SkillsListView, cmd = m.SkillsListView.Update(msg)
		if _, ok := msg.(BackToChatMsg); ok {
			m.CurrentView = ViewChat
		}
		return m, cmd

	case ViewMcpStatus:
		var cmd tea.Cmd
		m.McpStatusView, cmd = m.McpStatusView.Update(msg)
		if _, ok := msg.(BackToChatMsg); ok {
			m.CurrentView = ViewChat
		}
		return m, cmd
	}

	return m, nil
}

func (m AppModel) View() string {
	if m.PendingPermission != nil {
		return m.PermissionView.View()
	}

	switch m.CurrentView {
	case ViewChat:
		return m.ChatView.View()
	case ViewSessionList:
		return m.SessionListView.View()
	case ViewUndo:
		return m.UndoView.View()
	case ViewSettings:
		return m.SettingsView.View()
	case ViewModelSelect:
		return m.ModelSelectView.View()
	case ViewSkillsList:
		return m.SkillsListView.View()
	case ViewMcpStatus:
		return m.McpStatusView.View()
	default:
		return m.ChatView.View()
	}
}

func FormatHomeRelativePath(path string, home string) string {
	if strings.HasPrefix(path, "~") {
		return filepath.Join(home, path[1:])
	}
	return path
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CGO_ENABLED=0 go test -v ./internal/tui/ -run TestAppRoutingSwitch`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/tui/app.go internal/tui/views.go
git commit -m "refactor: isolate views into self-contained sub-models routing key events"
```

---

### Task 12: App Command Test Cases (`internal/tui/app_command_test.go`)

**Files:**
* Modify: `internal/tui/app_command_test.go`

- [ ] **Step 1: Write the failing test**

Modify `internal/tui/app_command_test.go` to test initialization flows:
```go
package tui

import (
	"testing"
)

func TestInitialModel(t *testing.T) {
	m := InitialModel()
	if m.CurrentView != ViewChat {
		t.Errorf("expected ViewChat view state initially, got %s", m.CurrentView)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CGO_ENABLED=0 go test -v ./internal/tui/ -run TestInitialModel`
Expected: Compile error on undefined types or fields inside test definitions.

- [ ] **Step 3: Write minimal implementation**

Ensure `internal/tui/app_command_test.go` matches:
```go
package tui

import (
	"testing"
)

func TestInitialModel(t *testing.T) {
	m := InitialModel()
	if m.CurrentView != ViewChat {
		t.Errorf("expected ViewChat view state initially, got %s", m.CurrentView)
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CGO_ENABLED=0 go test -v ./internal/tui/ -run TestInitialModel`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/tui/app_command_test.go
git commit -m "test: align initialization test model setup to new structures"
```
