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
	if !appModel.ShowMenu {
		t.Errorf("Expected ShowMenu to be true upon typing '/'")
	}
}
