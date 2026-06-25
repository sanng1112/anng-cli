package skills

import (
	"os"
	"path/filepath"
	"strings"
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

func TestExpandPromptWithActiveSkills(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "test_expand_active_skills")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	projectRoot := filepath.Join(tempDir, "project")
	homeDir := filepath.Join(tempDir, "home")

	skill1Dir := filepath.Join(projectRoot, ".agents", "skills", "writing-plans")
	skill2Dir := filepath.Join(projectRoot, ".agents", "skills", "task-management")
	
	_ = os.MkdirAll(skill1Dir, 0755)
	_ = os.MkdirAll(skill2Dir, 0755)

	_ = os.WriteFile(filepath.Join(skill1Dir, "SKILL.md"), []byte("---\nname: writing-plans\n---\nPlan body"), 0644)
	_ = os.WriteFile(filepath.Join(skill2Dir, "SKILL.md"), []byte("---\nname: task-management\n---\nTask body"), 0644)

	// Test 1: Expand with active skills, no explicit command
	res := ExpandPromptWithActiveSkills("hello", []string{"writing-plans", "task-management"}, projectRoot, homeDir)
	if !strings.Contains(res, `<user_command slash="writing-plans">Plan body</user_command>`) {
		t.Errorf("expected writing-plans block, got %q", res)
	}
	if !strings.Contains(res, `<user_command slash="task-management">Task body</user_command>`) {
		t.Errorf("expected task-management block, got %q", res)
	}
	if !strings.HasSuffix(res, "\nhello") {
		t.Errorf("expected prompt to end with new line hello, got %q", res)
	}

	// Test 2: Expand with active skills and one explicit command (should avoid duplication of the explicit command)
	res2 := ExpandPromptWithActiveSkills("/writing-plans hello", []string{"writing-plans", "task-management"}, projectRoot, homeDir)
	// writing-plans is explicit, so it should only appear once inside the prompt (from explicit expansion).
	// task-management should be prepended.
	countWritingPlans := strings.Count(res2, `slash="writing-plans"`)
	if countWritingPlans != 1 {
		t.Errorf("expected writing-plans tool to appear exactly once, got %d occurrences", countWritingPlans)
	}
	if !strings.Contains(res2, `<user_command slash="task-management">Task body</user_command>`) {
		t.Errorf("expected task-management block, got %q", res2)
	}
}
