package skills

import (
	"fmt"
	"os"
	"strings"
)

// FormatUserCommandBlock wraps the instruction content in a user_command XML tag.
func FormatUserCommandBlock(input string, slash string) string {
	return fmt.Sprintf("<user_command slash=\"%s\">%s</user_command>", slash, input)
}

// ExpandPrompt checks if the prompt begins with a slash command representing a skill.
// If it does, it loads all skills, finds the matching skill, reads its file content,
// excludes YAML frontmatter, wraps the skill content, and appends the rest of the prompt.
func ExpandPrompt(prompt string, projectRoot string, homeDir string) string {
	if !strings.HasPrefix(prompt, "/") {
		return prompt
	}

	// Split by whitespace to extract command and the rest
	parts := strings.SplitN(prompt, " ", 2)
	cmd := parts[0]
	rest := ""
	if len(parts) > 1 {
		rest = parts[1]
	}

	skillName := strings.TrimPrefix(cmd, "/")
	allSkills := LoadAllSkills(projectRoot, homeDir)

	var matchedPath string
	for _, s := range allSkills {
		if s.Name == skillName {
			matchedPath = s.Path
			break
		}
	}

	if matchedPath == "" {
		return prompt
	}

	data, err := os.ReadFile(matchedPath)
	if err != nil {
		return prompt
	}

	content := string(data)
	body := content
	if strings.HasPrefix(content, "---") {
		subParts := strings.SplitN(content, "---", 3)
		if len(subParts) >= 3 {
			body = subParts[2]
		}
	}
	body = strings.TrimSpace(body)

	wrapped := FormatUserCommandBlock(body, skillName)
	if rest != "" {
		return wrapped + " " + rest
	}
	return wrapped
}
