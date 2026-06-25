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
	IsSeparator     bool // renders as horizontal divider
	IsSearch        bool // search bar item
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
	original := m.ActiveIndex
	for {
		m.ActiveIndex = (m.ActiveIndex - 1 + len(m.Items)) % len(m.Items)
		if m.ActiveIndex == original {
			break
		}
		item := m.Items[m.ActiveIndex]
		if !item.IsSeparator && !item.IsSearch {
			break
		}
	}
}

func (m *DropdownMenuModel) MoveDown() {
	if len(m.Items) == 0 {
		return
	}
	original := m.ActiveIndex
	for {
		m.ActiveIndex = (m.ActiveIndex + 1) % len(m.Items)
		if m.ActiveIndex == original {
			break
		}
		item := m.Items[m.ActiveIndex]
		if !item.IsSeparator && !item.IsSearch {
			break
		}
	}
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

		// Separator: render horizontal divider
		if item.IsSeparator {
			sb.WriteString(lipgloss.NewStyle().Foreground(lipgloss.Color(ColorMutedGray)).Render(strings.Repeat("─", 40)) + "\n")
			continue
		}

		// Search bar item: render with magnifier icon
		if item.IsSearch {
			searchPrefix := "  "
			if i == m.ActiveIndex {
				searchPrefix = "> "
			}
			searchLine := fmt.Sprintf("%s🔍 %s", searchPrefix, item.Label)
			if i == m.ActiveIndex {
				sb.WriteString(lipgloss.NewStyle().Background(lipgloss.Color(BrandOrangeColor)).Foreground(lipgloss.Color("#FFFFFF")).Render(searchLine) + "\n")
			} else {
				sb.WriteString(searchLine + "\n")
			}
			continue
		}

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
