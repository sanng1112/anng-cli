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
	if !strings.Contains(prompt, "Model: deepseek-chat") {
		t.Error("Expected prompt to include the active model")
	}
	if !strings.Contains(prompt, "Model Family: DeepSeek") {
		t.Error("Expected prompt to include the model family")
	}
}

func TestPromptEngineSeparatesStaticPrefixFromRuntimeOverlay(t *testing.T) {
	engine := NewPromptEngine()

	tempDir1, err := os.MkdirTemp("", "anng-prompt-test-a")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir1)

	tempDir2, err := os.MkdirTemp("", "anng-prompt-test-b")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir2)

	parts1 := engine.BuildPromptParts("deepseek-chat", tempDir1, "act")
	parts2 := engine.BuildPromptParts("deepseek-chat", tempDir2, "act")

	if parts1.StaticPrefix != parts2.StaticPrefix {
		t.Fatal("expected static prefix to remain stable across project roots")
	}
	if parts1.RuntimeOverlay == parts2.RuntimeOverlay {
		t.Fatal("expected runtime overlay to vary with project root")
	}
	if !strings.Contains(parts1.StaticPrefix, "# ROLE & OBJECTIVE") {
		t.Fatal("expected static prefix to contain the base instructions")
	}
	if !strings.Contains(parts1.RuntimeOverlay, "Model: deepseek-chat") {
		t.Fatal("expected runtime overlay to include the model")
	}
}
