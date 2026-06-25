package tui

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

func GetScopeRiskColor(scope string) string {
	switch scope {
	case "read-in-cwd", "query-git-log":
		return "#22c55e" // green
	case "read-out-cwd", "write-in-cwd", "network", "mcp":
		return "#f59e0b" // amber/yellow
	case "write-out-cwd", "delete-in-cwd", "delete-out-cwd", "mutate-git-log", "unknown":
		return "#ef4444" // red
	default:
		return "#ef4444"
	}
}

type PermissionRequest struct {
	ToolName    string
	Command     string
	Description string
	Scopes      []string
}

func RenderPermissionPrompt(req PermissionRequest, selectedIdx int) string {
	var lines []string
	borderStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("#f59e0b")).
		Padding(1, 2)

	lines = append(lines, lipgloss.NewStyle().Foreground(lipgloss.Color("#f59e0b")).Bold(true).Render("Permission required for tool call:"))
	lines = append(lines, "")
	lines = append(lines, fmt.Sprintf("Tool:    %s", req.ToolName))
	lines = append(lines, fmt.Sprintf("Command: %s", req.Command))
	if req.Description != "" {
		lines = append(lines, fmt.Sprintf("Details: %s", req.Description))
	}

	lines = append(lines, "")
	lines = append(lines, "Do you want to proceed?")

	options := []string{"1. Yes", "2. Yes, always allow this scope", "3. No"}
	for idx, opt := range options {
		if idx == selectedIdx {
			lines = append(lines, lipgloss.NewStyle().Foreground(lipgloss.Color(BrandOrangeColor)).Render("> "+opt))
		} else {
			lines = append(lines, "  "+opt)
		}
	}

	return borderStyle.Render(strings.Join(lines, "\n"))
}
