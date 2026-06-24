package tui

import (
	"github.com/charmbracelet/lipgloss"
)

const (
	BrandOrangeColor = "#D4704B"
)

var (
	// Adaptive color palette (Light vs Dark)
	colorBrandOrange = lipgloss.AdaptiveColor{Light: "#b85c37", Dark: "#D4704B"}
	colorDarkOrange  = lipgloss.AdaptiveColor{Light: "#8a3c20", Dark: "#A65030"}
	colorMutedGray   = lipgloss.AdaptiveColor{Light: "#7a7060", Dark: "#888888"}
	colorGreen       = lipgloss.AdaptiveColor{Light: "#3d7a42", Dark: "#22c55e"}
	colorAmber       = lipgloss.AdaptiveColor{Light: "#b07530", Dark: "#f59e0b"}
	colorRed         = lipgloss.AdaptiveColor{Light: "#b5433a", Dark: "#ef4444"}

	// String color values (kept for backward compatibility where needed)
	ColorBrandOrange = "#D4704B"
	ColorDarkOrange  = "#A65030"
	ColorMutedGray   = "#888888"
	ColorGreen       = "#22c55e"
	ColorAmber       = "#f59e0b"
	ColorRed         = "#ef4444"
)

var (
	OrangeStyle = lipgloss.NewStyle().Foreground(colorBrandOrange)

	StyleTitle = lipgloss.NewStyle().
			Foreground(colorBrandOrange).
			Bold(true)

	StyleInput = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(colorBrandOrange).
			Padding(0, 1)

	StyleHelp = lipgloss.NewStyle().
			Foreground(colorMutedGray)

	StyleError = lipgloss.NewStyle().
			Foreground(colorRed)

	StyleStatus = lipgloss.NewStyle().
			Foreground(colorAmber)

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
				BorderForeground(colorBrandOrange).
				Padding(0, 2)
)

func ApplyOrangeColor(text string) string {
	return OrangeStyle.Render(text)
}

func GetQuadrantBorder() string {
	return HeaderFrameStyle.Render(" mascot frame ")
}
