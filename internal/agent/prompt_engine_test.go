package agent

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPromptEngineBuildsSystemPrompt(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "anng-prompt-test")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	// Write dummy rules
	anngMdPath := filepath.Join(tempDir, "ANNG.md")
	_ = os.WriteFile(anngMdPath, []byte("# Special Rule\nAlways explain code changes."), 0644)

	engine := NewPromptEngine()
	prompt := engine.BuildSystemPrompt("deepseek-chat", tempDir, "plan")

	if !strings.Contains(prompt, "Special Rule") {
		t.Error("Expected prompt to contain rules from ANNG.md")
	}
	if !strings.Contains(prompt, "# PLANNING MODE") {
		t.Error("Expected prompt to contain plan mode instructions")
	}
}
