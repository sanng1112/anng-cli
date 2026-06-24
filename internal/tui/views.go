package tui

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

type TuiView string

const (
	ViewChat        TuiView = "chat"
	ViewSessionList TuiView = "session-list"
	ViewUndo        TuiView = "undo"
	ViewMcpStatus   TuiView = "mcp-status"
	ViewSettings    TuiView = "settings"
	ViewModelSelect TuiView = "model-select"
)

func RenderSessionList(sessions []string, selectedIdx int) string {
	var lines []string
	lines = append(lines, lipgloss.NewStyle().Bold(true).Render("Resumable Chat Sessions:"))
	lines = append(lines, "")
	for idx, s := range sessions {
		if idx == selectedIdx {
			lines = append(lines, lipgloss.NewStyle().Foreground(lipgloss.Color(BrandOrangeColor)).Render(fmt.Sprintf("> %s", s)))
		} else {
			lines = append(lines, fmt.Sprintf("  %s", s))
		}
	}
	lines = append(lines, "")
	lines = append(lines, lipgloss.NewStyle().Foreground(lipgloss.Color("#888888")).Render("enter: resume  •  esc: cancel  •  d: delete session"))
	return strings.Join(lines, "\n")
}

func RenderUndoSelector(checkpoints []string, selectedIdx int) string {
	var lines []string
	lines = append(lines, lipgloss.NewStyle().Bold(true).Render("Undo conversation checkpoints:"))
	lines = append(lines, "")
	for idx, c := range checkpoints {
		if idx == selectedIdx {
			lines = append(lines, lipgloss.NewStyle().Foreground(lipgloss.Color(BrandOrangeColor)).Render(fmt.Sprintf("> [Restore] %s", c)))
		} else {
			lines = append(lines, fmt.Sprintf("  [Target]  %s", c))
		}
	}
	lines = append(lines, "")
	lines = append(lines, lipgloss.NewStyle().Foreground(lipgloss.Color("#888888")).Render("enter: restore point  •  esc: cancel"))
	return strings.Join(lines, "\n")
}

func RenderMcpStatus(mcpServers []string, statuses map[string]string) string {
	var lines []string
	lines = append(lines, lipgloss.NewStyle().Bold(true).Render("MCP Server Connections:"))
	lines = append(lines, "")
	for _, mcp := range mcpServers {
		status := statuses[mcp]
		color := "#ef4444" // red
		if status == "connected" {
			color = "#22c55e" // green
		}
		statusLabel := lipgloss.NewStyle().Foreground(lipgloss.Color(color)).Render(status)
		lines = append(lines, fmt.Sprintf("  • %-20s [%s]", mcp, statusLabel))
	}
	lines = append(lines, "")
	lines = append(lines, lipgloss.NewStyle().Foreground(lipgloss.Color("#888888")).Render("esc: return to chat"))
	return strings.Join(lines, "\n")
}

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
