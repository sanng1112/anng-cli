package tui

import (
	"strings"

	"github.com/charmbracelet/lipgloss"
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
