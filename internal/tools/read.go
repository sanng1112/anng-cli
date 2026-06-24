package tools

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"anng-cli/internal/contextkeys"
)

// ReadTool reads a file and returns its content with line numbers.
// Supports optional start_line and end_line arguments.
// Records the file state for later write verification.
func ReadTool(ctx context.Context, args map[string]interface{}) (string, error) {
	filePathVal, ok := args["file_path"].(string)
	if !ok || filePathVal == "" {
		return "", errors.New("missing or invalid required argument 'file_path'")
	}

	projectRoot := "."
	if pr, ok := ctx.Value(contextkeys.ProjectRootKey).(string); ok {
		projectRoot = pr
	}

	filePath := filePathVal
	if !filepath.IsAbs(filePath) {
		filePath = filepath.Join(projectRoot, filePath)
	}

	stat, err := os.Stat(filePath)
	if err != nil {
		return "", fmt.Errorf("file not found or unreadable: %w", err)
	}

	if stat.IsDir() {
		return "", errors.New("file_path points to a directory. Use bash for listing directories")
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		return "", fmt.Errorf("failed to read file: %w", err)
	}

	content := string(data)
	lines := strings.Split(content, "\n")

	startLine := 1
	if sl, ok := args["start_line"].(float64); ok {
		startLine = int(sl)
	}
	endLine := len(lines)
	if el, ok := args["end_line"].(float64); ok {
		endLine = int(el)
	}

	if startLine < 1 {
		startLine = 1
	}
	if endLine > len(lines) {
		endLine = len(lines)
	}
	if startLine > endLine {
		return "", errors.New("invalid start_line/end_line range")
	}

	var builder strings.Builder
	for i := startLine; i <= endLine; i++ {
		builder.WriteString(fmt.Sprintf("%d: %s\n", i, lines[i-1]))
	}

	// Track file state for write verification
	RecordFileState(ctx, filePath, content)

	return builder.String(), nil
}
