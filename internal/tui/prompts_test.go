package tui

import (
	"testing"
)

func TestPermissionPromptColor(t *testing.T) {
	color := GetScopeRiskColor("write-out-cwd")
	if color != "#ef4444" {
		t.Errorf("Expected red (#ef4444) for out-of-cwd write permission, got %s", color)
	}
}
