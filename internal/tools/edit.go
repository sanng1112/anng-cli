package tools

import (
	"context"
	"errors"
	"path/filepath"

	"anng-cli/internal/contextkeys"
)

// EditTool replaces a specific target string within a line range of a file.
// Wraps ReplaceFileContent with context-aware path resolution.
func EditTool(ctx context.Context, args map[string]interface{}) (string, error) {
	filePathVal, ok := args["file_path"].(string)
	if !ok || filePathVal == "" {
		return "", errors.New("missing required argument 'file_path'")
	}
	targetVal, ok := args["target_content"].(string)
	if !ok {
		return "", errors.New("missing required argument 'target_content'")
	}
	replacementVal, ok := args["replacement_content"].(string)
	if !ok {
		return "", errors.New("missing required argument 'replacement_content'")
	}
	startLineVal, ok := args["start_line"].(float64)
	if !ok {
		return "", errors.New("missing required argument 'start_line'")
	}
	endLineVal, ok := args["end_line"].(float64)
	if !ok {
		return "", errors.New("missing required argument 'end_line'")
	}

	projectRoot := "."
	if pr, ok := ctx.Value(contextkeys.ProjectRootKey).(string); ok {
		projectRoot = pr
	}

	filePath := filePathVal
	if !filepath.IsAbs(filePath) {
		filePath = filepath.Join(projectRoot, filePath)
	}

	err := ReplaceFileContent(filePath, targetVal, replacementVal, int(startLineVal), int(endLineVal))
	if err != nil {
		return "", err
	}

	return "Content replaced successfully", nil
}
