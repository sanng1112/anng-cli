package tui

import (
	"testing"
	tea "github.com/charmbracelet/bubbletea"
)

func TestModelSelectTrigger(t *testing.T) {
	model := NewModelSelectModel([]string{"gpt-4o", "gemini-1.5-pro"}, "gpt-4o")
	newModel, cmd := model.Update(tea.KeyMsg{Type: tea.KeyEnter})
	
	if cmd == nil {
		t.Fatalf("expected command on ModelSelect enter")
	}
	
	msg := cmd()
	if sm, ok := msg.(SwitchModelMsg); !ok || sm.Model != "gpt-4o" {
		t.Errorf("expected SwitchModelMsg for gpt-4o, got %v", msg)
	}
	_ = newModel
}

func TestSkillsListMultiSelection(t *testing.T) {
	skills := []string{"writing-plans", "task-management", "refactor"}
	active := []string{"refactor"}
	model := NewSkillsListModel(skills, active)

	if len(model.Dropdown.Items) != 3 {
		t.Fatalf("expected 3 skills, got %d", len(model.Dropdown.Items))
	}

	// Verify initial selected state
	if model.Dropdown.Items[0].Selected || model.Dropdown.Items[1].Selected || !model.Dropdown.Items[2].Selected {
		t.Errorf("expected only 'refactor' to be active, got states: %v, %v, %v",
			model.Dropdown.Items[0].Selected, model.Dropdown.Items[1].Selected, model.Dropdown.Items[2].Selected)
	}

	// Toggle first item (idx 0) with Space
	model.Dropdown.ActiveIndex = 0
	var cmd tea.Cmd
	model, cmd = model.Update(tea.KeyMsg{Type: tea.KeySpace})
	if cmd != nil {
		t.Errorf("expected no command on Space toggle")
	}

	if !model.Dropdown.Items[0].Selected {
		t.Errorf("expected item 0 to be selected after space toggle")
	}

	// Confirm with Enter
	model, cmd = model.Update(tea.KeyMsg{Type: tea.KeyEnter})
	if cmd == nil {
		t.Fatalf("expected command on confirmation")
	}

	msg := cmd()
	skMsg, ok := msg.(UpdateActiveSkillsMsg)
	if !ok {
		t.Fatalf("expected UpdateActiveSkillsMsg, got %T", msg)
	}

	// Active skills should contain both item 0 and item 2
	if len(skMsg.ActiveSkills) != 2 || skMsg.ActiveSkills[0] != "writing-plans" || skMsg.ActiveSkills[1] != "refactor" {
		t.Errorf("expected active skills to be ['writing-plans', 'refactor'], got %v", skMsg.ActiveSkills)
	}
}
