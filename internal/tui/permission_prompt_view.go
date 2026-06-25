package tui

import (
	tea "github.com/charmbracelet/bubbletea"
)

type PermissionDecisionMsg struct {
	Allow       bool
	AlwaysAllow bool
}

type PermissionPromptModel struct {
	Request PermissionRequest
	Cursor  int
}

func NewPermissionPromptModel(req PermissionRequest) PermissionPromptModel {
	return PermissionPromptModel{
		Request: req,
		Cursor:  0,
	}
}

func (m PermissionPromptModel) Update(msg tea.Msg) (PermissionPromptModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.Type {
		case tea.KeyEsc:
			return m, func() tea.Msg { return PermissionDecisionMsg{Allow: false, AlwaysAllow: false} }
		case tea.KeyUp:
			if m.Cursor > 0 {
				m.Cursor--
			}
		case tea.KeyDown:
			if m.Cursor < 2 {
				m.Cursor++
			}
		case tea.KeyEnter:
			allow := m.Cursor == 0 || m.Cursor == 1
			alwaysAllow := m.Cursor == 1
			return m, func() tea.Msg { return PermissionDecisionMsg{Allow: allow, AlwaysAllow: alwaysAllow} }
		}
	}
	return m, nil
}

func (m PermissionPromptModel) View() string {
	return "\n" + RenderPermissionPrompt(m.Request, m.Cursor)
}
