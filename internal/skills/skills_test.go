package skills

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDiscoverSkills(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "test_skills")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	skillDir := filepath.Join(tempDir, "writing-plans")
	if err := os.MkdirAll(skillDir, 0755); err != nil {
		t.Fatal(err)
	}

	skillMD := `---
name: writing-plans
description: Write comprehensive implementation plans
---
# Instructions body`

	if err := os.WriteFile(filepath.Join(skillDir, "SKILL.md"), []byte(skillMD), 0644); err != nil {
		t.Fatal(err)
	}

	list := DiscoverSkillsInRoot(tempDir)
	if len(list) != 1 {
		t.Fatalf("Expected 1 skill, got %d", len(list))
	}

	s := list[0]
	if s.Name != "writing-plans" {
		t.Errorf("Expected name 'writing-plans', got %q", s.Name)
	}
	if s.Description != "Write comprehensive implementation plans" {
		t.Errorf("Expected description, got %q", s.Description)
	}
}
