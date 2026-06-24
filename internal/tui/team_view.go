package tui

import (
	"fmt"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type TeamViewModel struct {
	Width     int
	Height    int
	TickState int
	LogLines  []string
	Mode      string // "team", "team-dp", "team-wf"
}

func NewTeamViewModel(mode string) TeamViewModel {
	return TeamViewModel{
		TickState: 0,
		Mode:      mode,
		LogLines: []string{
			"System: Initializing team session...",
			"System: Registered agents: [Coder], [Reviewer], [Tester], [Deployer]",
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
			switch m.TickState {
			case 0:
				m.LogLines = append(m.LogLines, "System: Resetting simulation. Coder restarts...")
			case 1:
				m.LogLines = append(m.LogLines, "Coder: Finished code changes. Submitting PR for review.")
				m.LogLines = append(m.LogLines, "System: Reviewer notified.")
			case 2:
				m.LogLines = append(m.LogLines, "Reviewer: Code looks good! Approved. Merging to develop.")
				m.LogLines = append(m.LogLines, "System: Tester triggered.")
			case 3:
				m.LogLines = append(m.LogLines, "Tester: All tests passed 100%. Deploying build...")
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

	getStatus := func(idx int) (string, string) {
		if m.TickState == idx {
			return "🟢 Running", BrandOrangeColor
		}
		if m.TickState > idx {
			return "✅ Finished", ColorGreen
		}
		return "⚪ Idle", ColorMutedGray
	}

	sCoder, cCoder := getStatus(0)
	coderContent := fmt.Sprintf("Agent: Coder\nStatus: %s\n\nTask: Implement workspace tools\nActivity: Coding bash & files...", lipgloss.NewStyle().Foreground(lipgloss.Color(cCoder)).Render(sCoder))
	var pCoder string
	if m.TickState == 0 {
		pCoder = activePaneStyle.Render(coderContent)
	} else {
		pCoder = paneStyle.Render(coderContent)
	}

	sReviewer, cReviewer := getStatus(1)
	reviewerContent := fmt.Sprintf("Agent: Reviewer\nStatus: %s\n\nTask: Inspect code structure\nActivity: Checking imports...", lipgloss.NewStyle().Foreground(lipgloss.Color(cReviewer)).Render(sReviewer))
	var pReviewer string
	if m.TickState == 1 {
		pReviewer = activePaneStyle.Render(reviewerContent)
	} else {
		pReviewer = paneStyle.Render(reviewerContent)
	}

	sTester, cTester := getStatus(2)
	testerContent := fmt.Sprintf("Agent: Tester\nStatus: %s\n\nTask: Verify codebase health\nActivity: Running go test...", lipgloss.NewStyle().Foreground(lipgloss.Color(cTester)).Render(sTester))
	var pTester string
	if m.TickState == 2 {
		pTester = activePaneStyle.Render(testerContent)
	} else {
		pTester = paneStyle.Render(testerContent)
	}

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
