package tui

import (
	"testing"
	tea "github.com/charmbracelet/bubbletea"
)

func TestTUIAppUpdates(t *testing.T) {
	m := InitialModel()
	
	// Simulate user typing in input textarea
	msg := tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("hello")}
	newModel, _ := m.Update(msg)
	
	appModel := newModel.(AppModel)
	if appModel.InputText != "hello" {
		t.Errorf("Expected InputText to be 'hello', got %q", appModel.InputText)
	}
}
