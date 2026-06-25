package tui

import (
	"strings"
	"testing"
)

func TestSessionViewSelector(t *testing.T) {
	model := NewSessionListModel(".")
	model.Dropdown.Items = []DropdownItem{
		{Key: "session-1", Label: "session-1"},
		{Key: "session-2", Label: "session-2"},
	}
	viewStr := model.View()
	if !strings.Contains(viewStr, "> session-1") {
		t.Errorf("Expected selected cursor session list render, got: %q", viewStr)
	}
}
