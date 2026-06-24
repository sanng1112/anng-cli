package tui

import (
	"github.com/charmbracelet/lipgloss"
)

const BrandOrangeColor = "#D4704B"

var (
	OrangeStyle = lipgloss.NewStyle().Foreground(lipgloss.Color(BrandOrangeColor))
	
	// Custom quadrant blocks frame border
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
				BorderForeground(lipgloss.Color(BrandOrangeColor)).
				Padding(0, 2)
)

func ApplyOrangeColor(text string) string {
	return OrangeStyle.Render(text)
}

func GetQuadrantBorder() string {
	return HeaderFrameStyle.Render(" mascot frame ")
}
