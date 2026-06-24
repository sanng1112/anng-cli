# Go Skills and Slash Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Implement skill discovery, frontmatter parsing, dynamic TUI slash commands populating, and skill wrapping block execution matching the TypeScript version in the Go implementation of `anng-cli`.

**Architecture:** Create an `internal/skills` package to discover skills under workspace-specific and global paths, parse `SKILL.md` frontmatter, dynamically populate TUI's autocomplete and slash menu items, and inject the matching skill instructions inside the LLM prompt using a `<user_command slash="...">` wrapper block.

**Tech Stack:** Go (Golang), Bubble Tea (TUI), gopkg.in/yaml.v3 (if needed, or custom parsing to keep things zero-dependency).

---

### Task 1: Skill Discovery & Frontmatter Parsing

**Files:**
- Create: `internal/skills/skills.go`
- Create: `internal/skills/skills_test.go`

- [x] **Step 1: Write the failing test**
  Create `internal/skills/skills_test.go` to verify scanning and reading frontmatter from dummy `SKILL.md` files.

```go
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
```

- [x] **Step 2: Run test to verify it fails**
  Run: `CGO_ENABLED=0 go test -v ./internal/skills/...`
  Expected: FAIL (package/functions not defined)

- [x] **Step 3: Write minimal implementation**
  Create `internal/skills/skills.go` with YAML frontmatter extractor using simple regex or string parsing to avoid external library dependencies:

```go
package skills

import (
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

type SkillInfo struct {
	Name        string
	Path        string
	Description string
}

func DiscoverSkillsInRoot(root string) []SkillInfo {
	var results []SkillInfo
	entries, err := os.ReadDir(root)
	if err != nil {
		return results
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		skillPath := filepath.Join(root, entry.Name(), "SKILL.md")
		if stat, err := os.Stat(skillPath); err == nil && !stat.IsDir() {
			if skill, err := ReadSkill(skillPath, entry.Name()); err == nil {
				results = append(results, skill)
			}
		}
	}
	return results
}

var (
	nameReg        = regexp.MustCompile(`(?m)^name:\s*(.+)`)
	descriptionReg = regexp.MustCompile(`(?m)^description:\s*(.+)`)
)

func ReadSkill(filePath string, fallbackName string) (SkillInfo, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return SkillInfo{}, err
	}

	content := string(data)
	name := fallbackName
	description := ""

	// Simple YAML Frontmatter Extraction
	if strings.HasPrefix(content, "---") {
		parts := strings.SplitN(content, "---", 3)
		if len(parts) >= 3 {
			frontmatter := parts[1]
			if m := nameReg.FindStringSubmatch(frontmatter); len(m) > 1 {
				name = strings.TrimSpace(m[1])
			}
			if m := descriptionReg.FindStringSubmatch(frontmatter); len(m) > 1 {
				description = strings.TrimSpace(m[1])
				// Clean potential quotes or multiline YAML folded blocks
				description = strings.Trim(description, `"'`)
			}
		}
	}

	return SkillInfo{
		Name:        name,
		Path:        filePath,
		Description: description,
	}, nil
}
```

- [x] **Step 4: Run test to verify it passes**
  Run: `CGO_ENABLED=0 go test -v ./internal/skills/...`
  Expected: PASS

- [x] **Step 5: Commit**
  ```bash
  git add internal/skills/skills.go internal/skills/skills_test.go
  git commit -m "feat: implement skill discovery and simple frontmatter parser"
  ```

---

### Task 2: Global and Project Skill Loader

**Files:**
- Modify: `internal/skills/skills.go`
- Modify: `internal/skills/skills_test.go`

- [x] **Step 1: Write the failing test**
  Add a test to verify collecting skills from multiple workspace-relative and global paths.

```go
func TestLoadAllSkills(t *testing.T) {
	home, _ := os.UserHomeDir()
	// Mock or verify loaded paths do not crash
	skills := LoadAllSkills(".", home)
	_ = skills
}
```

- [x] **Step 2: Run test to verify it fails**
  Run: `CGO_ENABLED=0 go test -v ./internal/skills/...`
  Expected: FAIL (missing LoadAllSkills)

- [x] **Step 3: Write minimal implementation**
  Add helper to resolve relative paths and collect skills in `internal/skills/skills.go`:

```go
func LoadAllSkills(projectRoot string, homeDir string) []SkillInfo {
	var all []SkillInfo
	seen := make(map[string]bool)

	roots := []string{
		filepath.Join(homeDir, ".gemini", "antigravity-cli", "builtin", "skills"),
		filepath.Join(homeDir, ".gemini", "config", "skills"),
		filepath.Join(projectRoot, ".agents", "skills"),
	}

	for _, root := range roots {
		for _, s := range DiscoverSkillsInRoot(root) {
			if !seen[s.Name] {
				seen[s.Name] = true
				all = append(all, s)
			}
		}
	}
	return all
}
```

- [x] **Step 4: Run test to verify it passes**
  Run: `CGO_ENABLED=0 go test -v ./internal/skills/...`
  Expected: PASS

- [x] **Step 5: Commit**
  ```bash
  git add internal/skills/skills.go internal/skills/skills_test.go
  git commit -m "feat: add multi-root skill loader supporting builtins and projects"
  ```

---

### Task 3: Dynamic Menu and Autocomplete in TUI

**Files:**
- Modify: `internal/tui/app.go`
- Modify: `internal/tui/autocomplete_test.go`

- [x] **Step 1: Write the failing test**
  Update `internal/tui/autocomplete_test.go` to verify autocomplete suggestions include dynamically loaded skills.

- [x] **Step 2: Run test to verify it fails**
  Run: `CGO_ENABLED=0 go test -v ./internal/tui/...`
  Expected: FAIL

- [x] **Step 3: Write minimal implementation**
  Update `InitialModelWithConfig` in `internal/tui/app.go` to scan and append slash commands:

```go
import (
	"anng-cli/internal/skills"
)

// In InitialModelWithConfig:
home, _ := os.UserHomeDir()
loadedSkills := skills.LoadAllSkills(cfg.ProjectRoot, home)

slashItems := []string{
	"/exit    — Thoát",
	"/new     — Phiên hội thoại mới",
	"/resume  — Tiếp tục phiên cũ",
	"/undo    — Hoàn tác checkpoint",
	"/mcp     — Trạng thái MCP servers",
	"/settings — Cài đặt",
	"/model   — Chọn model AI",
}

for _, s := range loadedSkills {
	slashItems = append(slashItems, fmt.Sprintf("/%s — %s", s.Name, s.Description))
}
```

- [x] **Step 4: Run test to verify it passes**
  Run: `CGO_ENABLED=0 go test -v ./internal/tui/...`
  Expected: PASS

- [x] **Step 5: Commit**
  ```bash
  git add internal/tui/app.go internal/tui/autocomplete_test.go
  git commit -m "feat: dynamically populate slash commands menu with available skills"
  ```

---

### Task 4: Skill Wrappers and Prompt Expansion

**Files:**
- Modify: `internal/tui/app.go`
- Create: `internal/skills/expand.go`
- Create: `internal/skills/expand_test.go`

- [x] **Step 1: Write the failing test**
  Create `internal/skills/expand_test.go` to verify input command expansion block logic.

```go
package skills

import (
	"strings"
	"testing"
)

func TestExpandSkillPrompt(t *testing.T) {
	skill := SkillInfo{
		Name: "writing-plans",
		Path: "/dummy/path/SKILL.md",
	}
	
	// mock file read
	content := "Follow these plan rules"
	
	expanded := FormatUserCommandBlock(content, "writing-plans")
	if !strings.Contains(expanded, "<user_command slash=\"writing-plans\">") {
		t.Errorf("Expected XML tag wrapper, got %q", expanded)
	}
}
```

- [x] **Step 2: Run test to verify it fails**
  Run: `CGO_ENABLED=0 go test -v ./internal/skills/...`
  Expected: FAIL

- [x] **Step 3: Write minimal implementation**
  Create `internal/skills/expand.go`:

```go
package skills

import (
	"fmt"
	"os"
	"strings"
)

func FormatUserCommandBlock(instructions string, slash string) string {
	return fmt.Sprintf("<user_command slash=%q>%s</user_command>", slash, instructions)
}

func ExpandPrompt(input string, allSkills []SkillInfo) string {
	trimmed := strings.TrimSpace(input)
	if !strings.HasPrefix(trimmed, "/") {
		return input
	}

	parts := strings.SplitN(trimmed, " ", 2)
	cmdName := strings.TrimPrefix(parts[0], "/")
	rest := ""
	if len(parts) > 1 {
		rest = parts[1]
	}

	for _, s := range allSkills {
		if s.Name == cmdName {
			// Read the skill MD body
			data, err := os.ReadFile(s.Path)
			if err != nil {
				return input
			}
			body := string(data)
			// Remove YAML frontmatter if present
			if strings.HasPrefix(body, "---") {
				subparts := strings.SplitN(body, "---", 3)
				if len(subparts) >= 3 {
					body = subparts[2]
				}
			}
			body = strings.TrimSpace(body)

			wrapped := FormatUserCommandBlock(body, s.Name)
			if rest != "" {
				return wrapped + "\n\n" + rest
			}
			return wrapped
		}
	}
	return input
}
```

  Then modify `internal/tui/app.go` to run prompt expansion before invoking orchestrator:

```go
// In app.go (Update case tea.KeyEnter where orchestrator is invoked):
text := strings.TrimSpace(m.Buffer.GetText())
...
// Find all loaded skills and expand input prompt if matching a skill slash command
home, _ := os.UserHomeDir()
allSkills := skills.LoadAllSkills(m.Config.ProjectRoot, home)
expandedText := skills.ExpandPrompt(text, allSkills)

// Then pass expandedText into orch.Run(ctx, expandedText)
```

- [x] **Step 4: Run test to verify it passes**
  Run: `CGO_ENABLED=0 go test -v ./...`
  Expected: PASS

- [x] **Step 5: Commit**
  ```bash
  git add internal/skills/expand.go internal/skills/expand_test.go internal/tui/app.go
  git commit -m "feat: expand skill prompts inside user commands tag wrapping block"
  ```
