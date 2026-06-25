package tui

import (
	"testing"
	tea "github.com/charmbracelet/bubbletea"
)

func TestKeyboardInterceptors(t *testing.T) {
	m := InitialModel()

	// Slash command prompt key check
	menuMsg := tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("/")}
	newModel, _ := m.Update(menuMsg)

	appModel := newModel.(AppModel)
	if !appModel.ChatView.ShowMenu {
		t.Errorf("Expected ShowMenu to be true upon typing '/'")
	}
}

func TestInitialModel(t *testing.T) {
	m := InitialModel()
	if m.CurrentView != ViewChat {
		t.Errorf("expected ViewChat view state initially, got %s", m.CurrentView)
	}
}
