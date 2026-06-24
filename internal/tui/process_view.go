package tui

import (
	"strings"

	"github.com/charmbracelet/lipgloss"
)

func FormatStdoutBuffer(stdout string, maxLines int) string {
	lines := strings.Split(stdout, "\n")
	if len(lines) <= maxLines {
		return stdout
	}
	truncated := lines[len(lines)-maxLines:]
	return "...\n" + strings.Join(truncated, "\n")
}

func RenderProcessStdoutView(commandName string, stdoutBuffer string, timeoutSec int, height int) string {
	borderStyle := lipgloss.NewStyle().
		Border(lipgloss.DoubleBorder()).
		BorderForeground(lipgloss.Color(BrandOrangeColor)).
		Padding(0, 1)

	var lines []string
	lines = append(lines, lipgloss.NewStyle().Bold(true).Render("Running Subprocess Outputs: "+commandName))
	lines = append(lines, lipgloss.NewStyle().Foreground(lipgloss.Color("#888888")).Render("Timeout countdown: ..."))
	lines = append(lines, "")
	lines = append(lines, FormatStdoutBuffer(stdoutBuffer, height-6))
	lines = append(lines, "")
	lines = append(lines, lipgloss.NewStyle().Foreground(lipgloss.Color("#888888")).Render("esc: return to background  •  t: adjust execution timeout"))

	return borderStyle.Render(strings.Join(lines, "\n"))
}
