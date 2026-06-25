package tui

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAutocompleteSlash(t *testing.T) {
	items := []string{"/exit", "/new", "/resume", "/undo", "/mcp", "/settings"}
	matches := FilterAutocomplete(items, "/ex")
	if len(matches) != 1 || matches[0] != "/exit" {
		t.Errorf("Expected '/exit', got %v", matches)
	}
}

func TestAutocompleteSkills(t *testing.T) {
	items := []string{
		"/exit    — Thoát",
		"/new     — Phiên hội thoại mới",
		"/writing-plans — Viết kế hoạch triển khai",
	}
	matches := FilterAutocomplete(items, "/wr")
	if len(matches) != 1 || matches[0] != "/writing-plans — Viết kế hoạch triển khai" {
		t.Errorf("Expected '/writing-plans — Viết kế hoạch triển khai', got %v", matches)
	}
}

func TestAutocompleteSkillsWithModel(t *testing.T) {
	tempHome, err := os.MkdirTemp("", "test_home")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempHome)

	skillDir := filepath.Join(tempHome, ".gemini", "antigravity-cli", "builtin", "skills", "writing-plans")
	if err := os.MkdirAll(skillDir, 0755); err != nil {
		t.Fatal(err)
	}

	skillMD := `---
name: writing-plans
description: Viết kế hoạch triển khai
---
# Instructions body`

	if err := os.WriteFile(filepath.Join(skillDir, "SKILL.md"), []byte(skillMD), 0644); err != nil {
		t.Fatal(err)
	}

	oldHome := os.Getenv("HOME")
	os.Setenv("HOME", tempHome)
	defer os.Setenv("HOME", oldHome)

	m := InitialModelWithConfig(AppConfig{
		ProjectRoot: ".",
	})

	found := false
	for _, item := range m.ChatView.SlashItems {
		if strings.Contains(item, "/writing-plans") {
			found = true
			if !strings.Contains(item, "Viết kế hoạch triển khai") {
				t.Errorf("Expected description 'Viết kế hoạch triển khai' in slash item, got %q", item)
			}
			break
		}
	}

	if !found {
		t.Errorf("Expected '/writing-plans' in SlashItems, but not found. Items: %v", m.ChatView.SlashItems)
	}
}

func TestBuiltinCommandsExist(t *testing.T) {
	cfg := AppConfig{Version: "0.2.1", ProjectRoot: "."}
	m := InitialModelWithConfig(cfg)
	
	expectedCmds := []string{"/skills", "/init", "/continue", "/raw", "/team", "/team-dp", "/team-wf", "/custom-agents"}
	for _, expected := range expectedCmds {
		found := false
		for _, item := range m.ChatView.SlashItems {
			if len(item) >= len(expected) && item[:len(expected)] == expected {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("Expected builtin command %q not found in SlashItems", expected)
		}
	}
}

func TestSlashCommandsCategories(t *testing.T) {
	items := []string{
		"[Built-in Commands] /new — Fresh conversation",
		"[Built-in Commands] /exit — Quit ANNG CLI",
		"[Custom & Loaded Skills] /writing-plans — Write implementation plans",
	}
	matches := FilterAutocomplete(items, "/w")
	if len(matches) != 1 || !strings.Contains(matches[0], "/writing-plans") {
		t.Errorf("failed filtering loaded skill command, got %v", matches)
	}
}

