package tui

import (
	"strings"
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

func TestChatLogEntryTypes(t *testing.T) {
	userEntry := UserChatEntry("Hello")
	if userEntry.Type != "user" || userEntry.Content != "Hello" {
		t.Errorf("UserChatEntry mismatch: %+v", userEntry)
	}
	toolEntry := ToolChatEntry("read_file", "main.go", "content")
	if toolEntry.Type != "tool" || toolEntry.ToolName != "read_file" || toolEntry.Icon != "📄" {
		t.Errorf("ToolChatEntry mismatch: %+v", toolEntry)
	}
	if ToolChatEntry("bash", "ls", "out").Collapsed {
		t.Errorf("expected short content (<200) expanded by default")
	}
	if !ToolChatEntry("bash", "ls", string(make([]byte, 300))).Collapsed {
		t.Errorf("expected long content (>200) collapsed by default")
	}
	errEntry := ErrorChatEntry("fail")
	if errEntry.Type != "error" || errEntry.Icon != "❌" {
		t.Errorf("ErrorChatEntry mismatch: %+v", errEntry)
	}
	sysEntry := SystemChatEntry("done")
	if sysEntry.Type != "system" || sysEntry.Icon != "ℹ️" {
		t.Errorf("SystemChatEntry mismatch: %+v", sysEntry)
	}
}

func TestCollapseToggle(t *testing.T) {
	cfg := AppConfig{Model: "gpt-4o"}
	model := NewChatViewModel(cfg, []string{"/model"})
	entry := ToolChatEntry("read_file", "test.go", "file content here")
	entry.Collapsed = true
	model.LogBuffer = append(model.LogBuffer, entry)
	view := model.View()
	if !strings.Contains(view, "▶") {
		t.Errorf("expected collapsed indicator ▶ in view, got: %q", view)
	}
	model.HoveredLogIdx = 0
	model, _ = model.Update(tea.KeyMsg{Type: tea.KeyCtrlO})
	view2 := model.View()
	if !strings.Contains(view2, "▼") {
		t.Errorf("expected expanded indicator ▼ after toggle, got: %q", view2)
	}
	if !strings.Contains(view2, "file content here") {
		t.Errorf("expanded entry should show content, got: %q", view2)
	}
}

func TestModelsAliasCommand(t *testing.T) {
	cfg := AppConfig{Model: "gpt-4o"}
	model := NewChatViewModel(cfg, []string{"/model", "/models"})
	model.Buffer.Insert("/models")
	newModel, cmd := model.Update(tea.KeyMsg{Type: tea.KeyEnter})
	if cmd == nil {
		t.Fatalf("expected cmd for /models command")
	}
	msg := cmd()
	trigger, ok := msg.(TriggerViewMsg)
	if !ok || trigger.View != ViewModelSelect {
		t.Errorf("expected TriggerViewMsg with ViewModelSelect, got %v", msg)
	}
	_ = newModel
}

func TestChatViewModelLogBufferType(t *testing.T) {
	cfg := AppConfig{Model: "gpt-4o"}
	model := NewChatViewModel(cfg, nil)
	model.LogBuffer = append(model.LogBuffer,
		UserChatEntry("test"),
		AssistantChatEntry("response"),
		ToolChatEntry("bash", "echo hi", "hi"),
	)
	if len(model.LogBuffer) != 3 {
		t.Errorf("expected 3 entries, got %d", len(model.LogBuffer))
	}
	if model.LogBuffer[0].Type != "user" || model.LogBuffer[1].Type != "assistant" || model.LogBuffer[2].Type != "tool" {
		t.Errorf("entry types mismatch")
	}
}
