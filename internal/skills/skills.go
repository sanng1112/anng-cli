package skills

import (
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
