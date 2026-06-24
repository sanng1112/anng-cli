package tools

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"anng-cli/internal/contextkeys"
)

// WriteTool writes content to a file.
// For existing non-empty files, requires the file to have been read first in this session
// and verifies no external modifications have occurred since.
func WriteTool(ctx context.Context, args map[string]interface{}) (string, error) {
	filePathVal, ok := args["file_path"].(string)
	if !ok || filePathVal == "" {
		return "", errors.New("missing required argument 'file_path'")
	}
	contentVal, ok := args["content"].(string)
	if !ok {
		return "", errors.New("missing required argument 'content'")
	}

	projectRoot := "."
	if pr, ok := ctx.Value(contextkeys.ProjectRootKey).(string); ok {
		projectRoot = pr
	}

	filePath := filePathVal
	if !filepath.IsAbs(filePath) {
		filePath = filepath.Join(projectRoot, filePath)
	}

	exists := true
	stat, err := os.Stat(filePath)
	if os.IsNotExist(err) {
		exists = false
	} else if err != nil {
		return "", err
	}

	if exists {
		if stat.IsDir() {
			return "", errors.New("file_path points to a directory")
		}
		if stat.Size() > 0 {
			state, recorded := GetFileState(ctx, filePath)
			if !recorded {
				return "", errors.New("Must read the full existing file before writing")
			}
			currentDiskBytes, err := os.ReadFile(filePath)
			if err != nil {
				return "", err
			}
			if string(currentDiskBytes) != state.Content {
				return "", errors.New("File has been modified since read. Read it again before writing")
			}
		}
	}

	// Create parent directories if they don't exist
	dir := filepath.Dir(filePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", fmt.Errorf("failed to create directory structure: %w", err)
	}

	if err := os.WriteFile(filePath, []byte(contentVal), 0644); err != nil {
		return "", fmt.Errorf("failed to write file: %w", err)
	}

	// Update cached state so subsequent writes in same session work
	RecordFileState(ctx, filePath, contentVal)

	if exists {
		return "Updated file.", nil
	}
	return "Created file.", nil
}
