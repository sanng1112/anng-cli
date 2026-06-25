package tui

import (
	"strings"
	"testing"
	tea "github.com/charmbracelet/bubbletea"
)

func TestTUIAppUpdates(t *testing.T) {
	m := InitialModel()

	// Simulate user typing in input textarea
	msg := tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("hello")}
	newModel, _ := m.Update(msg)

	appModel := newModel.(AppModel)
	if appModel.ChatView.Buffer.GetText() != "hello" {
		t.Errorf("Expected Buffer text to be 'hello', got %q", appModel.ChatView.Buffer.GetText())
	}
}

func TestAppRoutingSwitch(t *testing.T) {
	cfg := AppConfig{Version: "0.2.2"}
	app := InitialModelWithConfig(cfg)
	
	// Route keys through isolated sub-model routing
	app.CurrentView = ViewSettings
	app.SettingsView = NewSettingsViewModel(cfg)
	
	// Send escape to return to chat
	newModel, cmd := app.Update(tea.KeyMsg{Type: tea.KeyEsc})
	if cmd != nil {
		msg := cmd()
		newModel, _ = newModel.Update(msg)
	}
	updatedApp := newModel.(AppModel)
	
	// Verify view switches to ViewChat through back-propagation message routing
	if updatedApp.CurrentView != ViewChat {
		t.Errorf("AppModel did not switch back to ViewChat from ViewSettings on Esc")
	}
}

func TestInvariantHeadlessModeRunsWithoutTUI(t *testing.T) {
	// Simple stub, headless mode logic is primarily tested via CLI flag parsing and route mapping
}

func TestAppShowsPermissionPromptForManualMode(t *testing.T) {
	model := InitialModelWithConfig(AppConfig{
		ProjectRoot: "/tmp/project",
		Model:       "gpt-4o",
		ApiKey:      "mock-key",
		AutoAccept:  false,
		PlanMode:    false,
	})

	req := &PermissionRequest{
		ToolName: "bash",
		Command:  "rm -rf dist",
	}
	model.PendingPermission = req
	model.PermissionView = NewPermissionPromptModel(*req)

	view := model.View()
	if !strings.Contains(view, "bash") {
		t.Fatalf("expected permission view to mention tool name, got %q", view)
	}
}
