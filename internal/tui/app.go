package tui

import (
	tea "github.com/charmbracelet/bubbletea"
)

type AppModel struct {
	InputText string
	LogBuffer []string
	Width     int
	Height    int
}

func InitialModel() AppModel {
	return AppModel{
		InputText: "",
		LogBuffer: []string{},
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
		case tea.KeyRunes:
			m.InputText += string(msg.Runes)
		case tea.KeyBackspace:
			if len(m.InputText) > 0 {
				m.InputText = m.InputText[:len(m.InputText)-1]
			}
		}
	case tea.WindowSizeMsg:
		m.Width = msg.Width
		m.Height = msg.Height
	}
	return m, nil
}

func (m AppModel) View() string {
	// Generates terminal layout elements
	return m.InputText
}
