package tui

import (
	"testing"
	tea "github.com/charmbracelet/bubbletea"
)

func TestSessionListKeyEsc(t *testing.T) {
	model := NewSessionListModel(".")
	newModel, cmd := model.Update(tea.KeyMsg{Type: tea.KeyEsc})
	
	if cmd == nil {
		t.Fatalf("expected command return on escape press")
	}
	
	msg := cmd()
	if _, ok := msg.(BackToChatMsg); !ok {
		t.Errorf("expected BackToChatMsg on Esc, got %T", msg)
	}
	_ = newModel
}
