# Slash Command Menu UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the TUI layout issues where the slash command menu overlaps with the main interface and descriptions are truncated, by incorporating word wrapping and fixed-width formatting using lipgloss.

**Architecture:** Update `RenderDropdownMenu` in `internal/tui/autocomplete.go` to split commands and descriptions. Use `lipgloss` to render them in a two-column layout with word wrapping for descriptions. Add auto-scrolling to the menu to constrain its height.

**Tech Stack:** Go, lipgloss.

---

### Task 1: Refactor RenderDropdownMenu for Two-Column Layout

**Files:**
- Modify: `internal/tui/autocomplete.go`
- Test: `internal/tui/autocomplete_test.go`

- [ ] **Step 1: Write a test for the new dropdown layout**

Update `internal/tui/autocomplete_test.go` to add a test checking if the rendered string handles the format properly:

```go
package tui

import (
	"strings"
	"testing"
)

func TestRenderDropdownMenu_Format(t *testing.T) {
	matches := []string{
		"/test — A very long description that should be wrapped properly by lipgloss",
	}
	output := RenderDropdownMenu(matches, 0, 80)
	if output == "" {
		t.Error("RenderDropdownMenu returned empty string")
	}
	if !strings.Contains(output, "/test") {
		t.Error("RenderDropdownMenu output missing command name")
	}
}
```

- [ ] **Step 2: Run test to verify it fails (or compiles)**

Run: `CGO_ENABLED=0 go test ./internal/tui/... -run TestRenderDropdownMenu_Format`
Expected: PASS or FAIL

- [ ] **Step 3: Implement new RenderDropdownMenu in autocomplete.go**

Modify `internal/tui/autocomplete.go` to implement word-wrapping, two columns and auto-scrolling:

```go
package tui

import (
	"strings"

	"github.com/charmbracelet/lipgloss"
)

func FilterAutocomplete(items []string, prefix string) []string {
	var matches []string
	for _, item := range items {
		if strings.HasPrefix(item, prefix) {
			matches = append(matches, item)
		}
	}
	return matches
}

func RenderDropdownMenu(matches []string, selectedIdx int, width int) string {
	if len(matches) == 0 {
		return ""
	}

	// Dynamic menu width based on screen width, with padding
	menuWidth := width - 4
	if menuWidth < 40 {
		menuWidth = 40
	}
	if menuWidth > 100 {
		menuWidth = 100
	}

	cmdWidth := 15
	descWidth := menuWidth - cmdWidth - 6 // margins and separators
	if descWidth < 20 {
		descWidth = 20
	}

	// Auto-scrolling logic
	maxVisible := 6
	startIdx := 0
	if len(matches) > maxVisible {
		if selectedIdx >= maxVisible {
			startIdx = selectedIdx - maxVisible + 1
		}
		if startIdx+maxVisible > len(matches) {
			startIdx = len(matches) - maxVisible
		}
	}
	
	endIdx := startIdx + maxVisible
	if endIdx > len(matches) {
		endIdx = len(matches)
	}

	visibleMatches := matches[startIdx:endIdx]
	relSelectedIdx := selectedIdx - startIdx

	menuStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color(BrandOrangeColor)).
		Width(menuWidth)

	var rendered []string

	for idx, match := range visibleMatches {
		parts := strings.SplitN(match, " — ", 2)
		cmdText := parts[0]
		descText := ""
		if len(parts) > 1 {
			descText = parts[1]
		} else {
			parts = strings.SplitN(match, " - ", 2)
			cmdText = parts[0]
			if len(parts) > 1 {
				descText = parts[1]
			}
		}

		bg := lipgloss.Color("")
		fg := lipgloss.Color("")
		descFg := lipgloss.Color("#888888")
		if idx == relSelectedIdx {
			bg = lipgloss.Color(BrandOrangeColor)
			fg = lipgloss.Color("#FFFFFF")
			descFg = lipgloss.Color("#FFFFFF")
		}

		cmdCol := lipgloss.NewStyle().
			Width(cmdWidth).
			Background(bg).
			Foreground(fg).
			Render(cmdText)

		descCol := lipgloss.NewStyle().
			Width(descWidth).
			Background(bg).
			Foreground(descFg).
			Render(descText)

		prefix := "  "
		if idx == relSelectedIdx {
			prefix = lipgloss.NewStyle().Background(bg).Foreground(fg).Render("> ")
		}

		line := lipgloss.JoinHorizontal(lipgloss.Top, prefix, cmdCol, lipgloss.NewStyle().Background(bg).Render(" "), descCol)
		
		if idx == relSelectedIdx {
			line = lipgloss.NewStyle().Background(bg).Width(menuWidth - 2).Render(line)
		}
		
		rendered = append(rendered, line)
	}

	return menuStyle.Render(strings.Join(rendered, "\n"))
}
```

- [ ] **Step 4: Run tests to verify it passes**

Run: `CGO_ENABLED=0 go test ./internal/tui/... -v`
Expected: PASS

- [ ] **Step 5: Commit changes**

```bash
git add internal/tui/autocomplete.go internal/tui/autocomplete_test.go
git commit -m "style(tui): redesign slash command menu with word wrapping, columns, and scroll bounds"
```

---
