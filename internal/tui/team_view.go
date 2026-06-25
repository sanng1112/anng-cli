package tui

import (
	"fmt"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// TeamAgentTask represents a task dispatched to a team agent.
type TeamAgentTask struct {
	AgentName string
	Task      string
	Status    string // "pending", "running", "completed", "failed"
	Output    string
}

type TeamViewModel struct {
	Width     int
	Height    int
	TickState int
	LogLines  []string
	Mode      string // "team", "team-dp", "team-wf"
	Tasks     []TeamAgentTask
	Prompt    string
}

func NewTeamViewModel(mode string) TeamViewModel {
	tasks := []TeamAgentTask{
		{AgentName: "Coder", Task: "Implement workspace tools", Status: "pending"},
		{AgentName: "Reviewer", Task: "Inspect code structure", Status: "pending"},
		{AgentName: "Tester", Task: "Verify codebase health", Status: "pending"},
	}
	return TeamViewModel{
		TickState: 0,
		Mode:      mode,
		Tasks:     tasks,
		LogLines: []string{
			"System: Initializing team session...",
			"System: Registered agents: [Coder], [Reviewer], [Tester]",
			"System: Workflow starts. Dispatching task to Coder...",
		},
	}
}

func (m TeamViewModel) Update(msg tea.Msg) (TeamViewModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.Type {
		case tea.KeyEsc:
			return m, func() tea.Msg { return BackToChatMsg{} }
		case tea.KeySpace:
			m.TickState = (m.TickState + 1) % 4
			// Update task statuses based on tick state
			for i := range m.Tasks {
				if i < m.TickState {
					m.Tasks[i].Status = "completed"
				} else if i == m.TickState {
					m.Tasks[i].Status = "running"
				} else {
					m.Tasks[i].Status = "pending"
				}
			}
			switch m.TickState {
			case 0:
				m.LogLines = append(m.LogLines, "System: Resetting pipeline. Coder restarts...")
			case 1:
				m.LogLines = append(m.LogLines, fmt.Sprintf("Coder: Task '%s' completed.", m.Tasks[0].Task))
				m.LogLines = append(m.LogLines, "System: Dispatched to Reviewer.")
			case 2:
				m.LogLines = append(m.LogLines, fmt.Sprintf("Reviewer: Task '%s' completed.", m.Tasks[1].Task))
				m.LogLines = append(m.LogLines, "System: Dispatched to Tester.")
			case 3:
				m.LogLines = append(m.LogLines, fmt.Sprintf("Tester: Task '%s' completed.", m.Tasks[2].Task))
				m.LogLines = append(m.LogLines, "System: Team workflow successfully completed!")
			}
			if len(m.LogLines) > 6 {
				m.LogLines = m.LogLines[len(m.LogLines)-6:]
			}
		}
	}
	return m, nil
}

func (m TeamViewModel) View() string {
	w := m.Width
	if w <= 0 {
		w = 80
	}
	h := m.Height
	if h <= 0 {
		h = 24
	}

	paneW := (w - 8) / 2
	paneH := (h - 10) / 2
	if paneW < 15 {
		paneW = 15
	}
	if paneH < 4 {
		paneH = 4
	}

	titleText := "ANNG MULTI-AGENT TEAM COMMAND CENTER"
	if m.Mode == "team-dp" {
		titleText = "ANNG DATA PARALLEL (DP) TEAM CONCURRENCY"
	} else if m.Mode == "team-wf" {
		titleText = "ANNG SEQUENTIAL WORKFLOW PIPELINE"
	}

	title := lipgloss.NewStyle().
		Foreground(lipgloss.Color(BrandOrangeColor)).
		Bold(true).
		Border(lipgloss.DoubleBorder()).
		BorderForeground(lipgloss.Color(BrandOrangeColor)).
		Padding(0, 2).
		Render(titleText)

	paneStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color(ColorMutedGray)).
		Width(paneW).
		Height(paneH).
		Padding(0, 1)

	activePaneStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color(BrandOrangeColor)).
		Width(paneW).
		Height(paneH).
		Padding(0, 1)

	agentStatusColor := func(task TeamAgentTask) (string, string) {
		switch task.Status {
		case "running":
			return "🟢 " + task.Status, BrandOrangeColor
		case "completed":
			return "✅ " + task.Status, ColorGreen
		default:
			return "⚪ " + task.Status, ColorMutedGray
		}
	}

	renderAgentPane := func(task TeamAgentTask, isActive bool) string {
		status, color := agentStatusColor(task)
		content := fmt.Sprintf("Agent: %s\nStatus: %s\n\nTask: %s",
			task.AgentName,
			lipgloss.NewStyle().Foreground(lipgloss.Color(color)).Render(status),
			task.Task)
		if isActive {
			return activePaneStyle.Render(content)
		}
		return paneStyle.Render(content)
	}

	pCoder := renderAgentPane(m.Tasks[0], m.TickState == 0)
	pReviewer := renderAgentPane(m.Tasks[1], m.TickState == 1)
	pTester := renderAgentPane(m.Tasks[2], m.TickState == 2)

	logContent := "System Orchestrator Log:\n"
	for _, line := range m.LogLines {
		logContent += "\n" + line
	}
	pLog := paneStyle.Render(logContent)

	row1 := lipgloss.JoinHorizontal(lipgloss.Top, pCoder, "  ", pReviewer)
	row2 := lipgloss.JoinHorizontal(lipgloss.Top, pTester, "  ", pLog)
	grid := lipgloss.JoinVertical(lipgloss.Left, row1, "\n", row2)

	footer := lipgloss.NewStyle().
		Foreground(lipgloss.Color(ColorMutedGray)).
		Render("space: simulate next step  •  esc: return to chat")

	return fmt.Sprintf("\n%s\n\n%s\n\n%s\n", title, grid, footer)
}
