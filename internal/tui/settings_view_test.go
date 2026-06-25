package tui

import (
	"os"
	"path/filepath"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
)

func TestSettingsWizardFlow(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "anng-settings-test")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	settingsPath := filepath.Join(tempDir, "settings.json")
	cfg := AppConfig{
		Model:        "deepseek-chat",
		Models:       []string{"gpt-4o", "deepseek-chat", "custom-model"},
		SettingsPath: settingsPath,
		ApiKey:       "original-key",
		BaseURL:      "https://original.api",
		AutoAccept:   false,
		PlanMode:     false,
	}

	model := NewSettingsViewModel(cfg)
	if model.Step != "main" {
		t.Errorf("expected initial step 'main', got %s", model.Step)
	}

	// Test case 1: Toggle scope (project to user and back)
	// scope is index 0
	model.Dropdown.ActiveIndex = 0
	model, _ = model.Update(tea.KeyMsg{Type: tea.KeyEnter})
	if model.Scope != "user" {
		t.Errorf("expected scope to toggle to user, got %s", model.Scope)
	}
	model, _ = model.Update(tea.KeyMsg{Type: tea.KeyEnter})
	if model.Scope != "project" {
		t.Errorf("expected scope to toggle back to project, got %s", model.Scope)
	}

	// Test provider selection
	model.Dropdown.ActiveIndex = 1
	model, _ = model.Update(tea.KeyMsg{Type: tea.KeyEnter})
	if model.Step != "provider" {
		t.Fatalf("expected provider step, got %s", model.Step)
	}
	model.Dropdown.ActiveIndex = 2
	model, _ = model.Update(tea.KeyMsg{Type: tea.KeyEnter})
	if model.Config.Provider != "deepseek" {
		t.Fatalf("expected provider deepseek, got %q", model.Config.Provider)
	}

	// Test case 2: Toggle auto_accept
	// auto_accept is index 7 after adding provider row
	model.Dropdown.ActiveIndex = 7
	model, _ = model.Update(tea.KeyMsg{Type: tea.KeyEnter})
	if !model.Config.AutoAccept {
		t.Errorf("expected AutoAccept to be true after toggle")
	}

	// Test case 3: Toggle plan_mode
	// plan_mode is index 8 and should be blocked while auto_accept is true
	model.Dropdown.ActiveIndex = 8
	model, _ = model.Update(tea.KeyMsg{Type: tea.KeyEnter})
	if model.Config.PlanMode {
		t.Errorf("expected PlanMode to remain false when auto_accept is true")
	}
	if model.ErrLine == "" {
		t.Errorf("expected validation error when enabling plan mode with auto_accept")
	}

	// Test case 4: API Key input flow
	// apiKey is index 3
	model.Dropdown.ActiveIndex = 3
	model, _ = model.Update(tea.KeyMsg{Type: tea.KeyEnter})
	if model.Step != "apiKeyInput" {
		t.Errorf("expected step apiKeyInput, got %s", model.Step)
	}
	// Input key chars
	model, _ = model.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("new-key")})
	model, _ = model.Update(tea.KeyMsg{Type: tea.KeyEnter})
	if model.Config.ApiKey != "new-key" {
		t.Errorf("expected ApiKey to be updated to 'new-key', got %s", model.Config.ApiKey)
	}
	if model.Step != "main" {
		t.Errorf("expected step to return to main, got %s", model.Step)
	}

	// Test case 5: Base URL input flow
	// baseURL is index 4
	model.Dropdown.ActiveIndex = 4
	model, _ = model.Update(tea.KeyMsg{Type: tea.KeyEnter})
	if model.Step != "baseURLInput" {
		t.Errorf("expected step baseURLInput, got %s", model.Step)
	}
	// Input URL chars
	model, _ = model.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("https://new.api")})
	model, _ = model.Update(tea.KeyMsg{Type: tea.KeyEnter})
	if model.Config.BaseURL != "https://new.api" {
		t.Errorf("expected BaseURL to be updated to 'https://new.api', got %s", model.Config.BaseURL)
	}
	if model.Step != "main" {
		t.Errorf("expected step to return to main, got %s", model.Step)
	}

	// Invalid reasoning effort should be rejected
	model.Dropdown.ActiveIndex = 6
	model, _ = model.Update(tea.KeyMsg{Type: tea.KeyEnter})
	if model.Step != "reasoningInput" {
		t.Fatalf("expected reasoningInput step, got %s", model.Step)
	}
	model, _ = model.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("invalid")})
	model, _ = model.Update(tea.KeyMsg{Type: tea.KeyEnter})
	if model.Step != "reasoningInput" {
		t.Fatalf("expected invalid reasoning to stay in reasoningInput, got %s", model.Step)
	}
	if model.ErrLine == "" {
		t.Fatalf("expected reasoning validation error")
	}

	// Back out and remove custom model
	model, _ = model.Update(tea.KeyMsg{Type: tea.KeyEsc})
	model.Dropdown.ActiveIndex = 2
	model, _ = model.Update(tea.KeyMsg{Type: tea.KeyEnter})
	if model.Step != "models" {
		t.Fatalf("expected models step, got %s", model.Step)
	}
	model.Dropdown.ActiveIndex = 2 // custom-model
	model, _ = model.Update(tea.KeyMsg{Type: tea.KeyDelete})
	for _, name := range model.Config.Models {
		if name == "custom-model" {
			t.Fatalf("expected custom model to be removed, got %v", model.Config.Models)
		}
	}

	// View rendering check
	viewStr := model.View()
	if viewStr == "" {
		t.Error("expected non-empty settings view rendering")
	}
}
