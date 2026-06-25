package tui

import (
	"testing"
	tea "github.com/charmbracelet/bubbletea"
)

func TestPermissionPromptAllow(t *testing.T) {
	req := PermissionRequest{
		ToolName: "test-tool",
		Command:  "echo hello",
	}
	model := NewPermissionPromptModel(req)
	newModel, cmd := model.Update(tea.KeyMsg{Type: tea.KeyEnter})
	
	if cmd == nil {
		t.Fatalf("expected decision message command on enter")
	}
	
	msg := cmd()
	decision, ok := msg.(PermissionDecisionMsg)
	if !ok {
		t.Fatalf("expected PermissionDecisionMsg, got %T", msg)
	}
	if !decision.Allow || decision.AlwaysAllow {
		t.Errorf("expected Allow to be true and AlwaysAllow to be false, got Allow=%v, AlwaysAllow=%v", decision.Allow, decision.AlwaysAllow)
	}
	_ = newModel
}
