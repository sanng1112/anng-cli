package tui

import "testing"

func TestDropdownMenuScrolling(t *testing.T) {
	items := []DropdownItem{
		{Key: "1", Label: "Item 1"},
		{Key: "2", Label: "Item 2"},
		{Key: "3", Label: "Item 3"},
		{Key: "4", Label: "Item 4"},
	}
	model := NewDropdownMenuModel("Test Menu", "Help", items, 2)
	
	if len(model.Items) != 4 {
		t.Fatalf("expected 4 items, got %d", len(model.Items))
	}
	
	// Test navigation
	model.MoveDown()
	if model.ActiveIndex != 1 {
		t.Errorf("expected ActiveIndex 1, got %d", model.ActiveIndex)
	}
	
	model.MoveDown()
	model.MoveDown()
	model.MoveDown() // wraps around
	if model.ActiveIndex != 0 {
		t.Errorf("expected ActiveIndex 0 after wrap, got %d", model.ActiveIndex)
	}
}
