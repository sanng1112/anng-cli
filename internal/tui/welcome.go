package tui

import (
	"fmt"
	"math/rand"
	"path/filepath"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

type WelcomeConfig struct {
	ProjectRoot     string
	Model           string
	ThinkingEnabled bool
	ReasoningEffort string
	Version         string
	ShowMascot      bool
}

func FormatHomeRelativePath(path string, home string) string {
	if home == "" {
		return path
	}
	rel, err := filepath.Rel(home, path)
	if err != nil || strings.HasPrefix(rel, "..") {
		return path
	}
	if rel == "." {
		return "~"
	}
	return "~" + string(filepath.Separator) + rel
}

var WelcomeTips = []string{
	"/model   - Select model and reasoning effort",
	"/new     - Start a fresh conversation",
	"/resume  - Pick a previous conversation to continue",
	"/undo    - Restore code/conversation to a previous point",
	"/mcp     - Show MCP server status and tools",
	"/exit    - Quit",
	"esc      - Interrupt current model reasoning",
}

func RenderWelcomeScreen(cfg WelcomeConfig, width int) string {
	mascot := ""
	if cfg.ShowMascot {
		mascot = RenderMascot(width) + "\n\n"
	}

	borderStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color(BrandOrangeColor)).
		Padding(0, 1)

	cwd := cfg.ProjectRoot

	lines := []string{
		fmt.Sprintf(" >_ welcome to ANNG CLI (v%s)", cfg.Version),
		"",
		fmt.Sprintf(" Model:            %s", cfg.Model),
		fmt.Sprintf(" Thinking Enabled: %v", cfg.ThinkingEnabled),
		fmt.Sprintf(" Reasoning Effort: %s", cfg.ReasoningEffort),
		fmt.Sprintf(" Workspace:        %s", cwd),
	}

	box := borderStyle.Render(strings.Join(lines, "\n"))

	tip := WelcomeTips[rand.Intn(len(WelcomeTips))]
	tipsBar := lipgloss.NewStyle().Foreground(lipgloss.Color("#888888")).Render("Tips: " + tip)

	return fmt.Sprintf("%s%s\n\n%s", mascot, box, tipsBar)
}
