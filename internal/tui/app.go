package tui

import (
	"fmt"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

const BrandColor = "#D4704B"

var (
	titleStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color(BrandColor)).
			Bold(true).
			MarginBottom(1)

	inputStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color(BrandColor)).
			Padding(0, 1).
			Width(60)

	helpStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#888888")).
			MarginTop(1)
)

type AppModel struct {
	InputText     string
	LogBuffer     []string
	Width         int
	Height        int
	ShowMenu      bool
	CurrentView   TuiView
	Sessions      []string
	SessionIdx    int
	Checkpoints   []string
	CheckpointIdx int
}

func InitialModel() AppModel {
	return AppModel{
		InputText:   "",
		LogBuffer:   []string{},
		ShowMenu:    false,
		CurrentView: ViewChat,
	}
}

func (m AppModel) Init() tea.Cmd {
	return nil
}

func (m AppModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.Type {
		case tea.KeyCtrlC:
			return m, tea.Quit
		case tea.KeyEnter:
			if m.InputText != "" {
				m.LogBuffer = append(m.LogBuffer, "> "+m.InputText)
				m.InputText = ""
				m.ShowMenu = false
			}
		case tea.KeyRunes:
			if string(msg.Runes) == "/" {
				m.ShowMenu = true
			}
			m.InputText += string(msg.Runes)
		case tea.KeyBackspace:
			if len(m.InputText) > 0 {
				m.InputText = m.InputText[:len(m.InputText)-1]
				if m.InputText == "" {
					m.ShowMenu = false
				}
			}
		case tea.KeyEsc:
			m.ShowMenu = false
			m.InputText = ""
		}
	case tea.WindowSizeMsg:
		m.Width = msg.Width
		m.Height = msg.Height
	}
	return m, nil
}

func (m AppModel) View() string {
	switch m.CurrentView {
	case ViewSessionList:
		return "\n" + RenderSessionList(m.Sessions, m.SessionIdx)
	case ViewUndo:
		return "\n" + RenderUndoSelector(m.Checkpoints, m.CheckpointIdx)
	case ViewMcpStatus:
		return "\n" + RenderMcpStatus([]string{"filesystem", "google-search"}, map[string]string{"filesystem": "connected", "google-search": "connected"})
	}

	title := titleStyle.Render("ANNG CLI (Go) — v0.2.000")

	// Log history
	history := ""
	for _, line := range m.LogBuffer {
		history += lipgloss.NewStyle().
			Foreground(lipgloss.Color("#CCCCCC")).
			Render(line) + "\n"
	}

	// Input box
	cursor := "█"
	inputBox := inputStyle.Render(m.InputText + cursor)

	// Help text
	help := helpStyle.Render("enter: send  •  esc: clear  •  ctrl+c: quit")

	// Optional slash menu hint
	menu := ""
	if m.ShowMenu {
		menu = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#FFAA44")).
			Render("  / — slash commands available\n")
	}

	return fmt.Sprintf("\n%s\n%s\n%s%s\n%s",
		title,
		history,
		menu,
		inputBox,
		help,
	)
}
