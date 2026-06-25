package tools

import (
	"errors"
	"os"
	"sort"
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

type ReplacementChunk struct {
	TargetContent      string `json:"targetContent"`
	ReplacementContent string `json:"replacementContent"`
	StartLine          int    `json:"startLine"`
	EndLine            int    `json:"endLine"`
}

func MultiReplaceFileContent(filePath string, chunks []ReplacementChunk) error {
	// Sort chunks from bottom to top so line numbers don't shift
	// when earlier chunks add/remove lines
	sorted := make([]ReplacementChunk, len(chunks))
	copy(sorted, chunks)
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].StartLine > sorted[j].StartLine
	})

	for _, chunk := range sorted {
		err := ReplaceFileContent(filePath, chunk.TargetContent, chunk.ReplacementContent, chunk.StartLine, chunk.EndLine)
		if err != nil {
			return err
		}
	}
	return nil
}

func init() { _ = sort.Slice } // ensure sort is imported
