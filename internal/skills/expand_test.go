package skills

import (
	"os"
	"path/filepath"
	"testing"
)

func TestFormatUserCommandBlock(t *testing.T) {
	input := "Write a detailed plan."
	slash := "writing-plans"
	expected := `<user_command slash="writing-plans">Write a detailed plan.</user_command>`
	result := FormatUserCommandBlock(input, slash)
	if result != expected {
		t.Errorf("Expected %q, got %q", expected, result)
	}
}

func TestExpandPrompt(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "test_expand_skills")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	// We need to set up the directories matching LoadAllSkills expectations
	// LoadAllSkills looks in projectRoot/.agents/skills and homeDir/.gemini/antigravity-cli/builtin/skills etc.
	projectRoot := filepath.Join(tempDir, "project")
	homeDir := filepath.Join(tempDir, "home")

	skillDir := filepath.Join(projectRoot, ".agents", "skills", "writing-plans")
	if err := os.MkdirAll(skillDir, 0755); err != nil {
		t.Fatal(err)
	}

	skillMD := `---
name: writing-plans
description: Write comprehensive implementation plans
---
# Writing Plans Instruction
Step 1: Plan
Step 2: Code`

	if err := os.WriteFile(filepath.Join(skillDir, "SKILL.md"), []byte(skillMD), 0644); err != nil {
		t.Fatal(err)
	}

	// Test non-slash prompt
	prompt1 := "just a regular prompt"
	res1 := ExpandPrompt(prompt1, projectRoot, homeDir)
	if res1 != prompt1 {
		t.Errorf("Expected prompt to remain unchanged, got %q", res1)
	}

	// Test unknown slash prompt
	prompt2 := "/unknown-skill do something"
	res2 := ExpandPrompt(prompt2, projectRoot, homeDir)
	if res2 != prompt2 {
		t.Errorf("Expected prompt to remain unchanged, got %q", res2)
	}

	// Test valid skill expansion
	prompt3 := "/writing-plans test it"
	res3 := ExpandPrompt(prompt3, projectRoot, homeDir)
	expectedContent := `<user_command slash="writing-plans"># Writing Plans Instruction
Step 1: Plan
Step 2: Code</user_command> test it`

	if res3 != expectedContent {
		t.Errorf("Expected expanded prompt:\n%q\nGot:\n%q", expectedContent, res3)
	}
}
