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
	var rendered []string

	menuStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color(BrandOrangeColor)).
		Width(40)

	for idx, match := range matches {
		if idx == selectedIdx {
			itemStyle := lipgloss.NewStyle().Background(lipgloss.Color(BrandOrangeColor)).Foreground(lipgloss.Color("#FFFFFF"))
			rendered = append(rendered, itemStyle.Render("> "+match))
		} else {
			rendered = append(rendered, "  "+match)
		}
	}
	return menuStyle.Render(strings.Join(rendered, "\n"))
}
