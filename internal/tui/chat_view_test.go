package tui

import (
	"testing"
	tea "github.com/charmbracelet/bubbletea"
)

func TestChatViewNavTrigger(t *testing.T) {
	cfg := AppConfig{Model: "gpt-4o"}
	model := NewChatViewModel(cfg, []string{"/settings"})
	
	// Simulate input typing
	model.Buffer.Insert("/settings")
	
	// Press enter
	newModel, cmd := model.Update(tea.KeyMsg{Type: tea.KeyEnter})
	if cmd == nil {
		t.Fatalf("expected view transition cmd on slash command submit")
	}
	
	msg := cmd()
	trigger, ok := msg.(TriggerViewMsg)
	if !ok || trigger.View != ViewSettings {
		t.Errorf("expected TriggerViewMsg with settings, got %v", msg)
	}
	_ = newModel
}
