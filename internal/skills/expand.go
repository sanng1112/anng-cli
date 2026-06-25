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

// ExpandPromptWithActiveSkills expands the prompt using both explicit slash commands and a list of active skills.
func ExpandPromptWithActiveSkills(prompt string, activeSkills []string, projectRoot string, homeDir string) string {
	// Check if there is an explicit skill command at the start of the prompt
	explicitSkill := ""
	if strings.HasPrefix(prompt, "/") {
		parts := strings.SplitN(prompt, " ", 2)
		cmd := strings.TrimPrefix(parts[0], "/")
		allSkills := LoadAllSkills(projectRoot, homeDir)
		for _, s := range allSkills {
			if s.Name == cmd {
				explicitSkill = cmd
				break
			}
		}
	}

	// Expand the prompt for the explicit skill command first
	expanded := ExpandPrompt(prompt, projectRoot, homeDir)

	// Prepend active skills (excluding the explicit one if it's already expanded)
	var activeBlocks []string
	allSkills := LoadAllSkills(projectRoot, homeDir)
	for _, skillName := range activeSkills {
		if skillName == explicitSkill {
			continue
		}
		var matchedPath string
		for _, s := range allSkills {
			if s.Name == skillName {
				matchedPath = s.Path
				break
			}
		}
		if matchedPath == "" {
			continue
		}
		data, err := os.ReadFile(matchedPath)
		if err != nil {
			continue
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
		activeBlocks = append(activeBlocks, FormatUserCommandBlock(body, skillName))
	}

	if len(activeBlocks) > 0 {
		return strings.Join(activeBlocks, "\n") + "\n" + expanded
	}
	return expanded
}
