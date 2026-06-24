package tui

import (
	"strings"
	"testing"
)

func TestSessionViewSelector(t *testing.T) {
	sessions := []string{"session-1", "session-2"}
	viewStr := RenderSessionList(sessions, 0)
	if !strings.Contains(viewStr, "> session-1") {
		t.Errorf("Expected selected cursor session list render, got: %q", viewStr)
	}
}
