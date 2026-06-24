package tools

import (
	"errors"
	"os"
	"strings"
)

func ReplaceFileContent(filePath string, targetContent string, replacementContent string, startLine int, endLine int) error {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return err
	}

	lines := strings.Split(string(data), "\n")
	if startLine < 1 || endLine > len(lines) || startLine > endLine {
		return errors.New("invalid line range specified")
	}

	// Join lines in range to check for exact target match
	targetRangeText := strings.Join(lines[startLine-1:endLine], "\n")
	if !strings.Contains(targetRangeText, targetContent) {
		return errors.New("target content not found in line range")
	}

	replacedText := strings.Replace(targetRangeText, targetContent, replacementContent, 1)

	// Reassemble file content
	var updatedLines []string
	updatedLines = append(updatedLines, lines[:startLine-1]...)
	updatedLines = append(updatedLines, replacedText)
	updatedLines = append(updatedLines, lines[endLine:]...)

	newContent := strings.Join(updatedLines, "\n")
	return os.WriteFile(filePath, []byte(newContent), 0644)
}
