package tui

import (
	tea "github.com/charmbracelet/bubbletea"
)

type AppModel struct {
	InputText string
	LogBuffer []string
	Width     int
	Height    int
	ShowMenu  bool
}

func InitialModel() AppModel {
	return AppModel{
		InputText: "",
		LogBuffer: []string{},
		ShowMenu:  false,
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
			if string(msg.Runes) == "/" {
				m.ShowMenu = true
			}
			m.InputText += string(msg.Runes)
		case tea.KeyBackspace:
			if len(m.InputText) > 0 {
				m.InputText = m.InputText[:len(m.InputText)-1]
			}
		case tea.KeyEsc:
			m.ShowMenu = false
		}
	case tea.WindowSizeMsg:
		m.Width = msg.Width
		m.Height = msg.Height
	}
	return m, nil
}

func (m AppModel) View() string {
	return m.InputText
}
