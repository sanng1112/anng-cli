package tools

import (
	"fmt"
	"path/filepath"
	"strings"
)

func resolveWorkspacePath(projectRoot string, inputPath string) (string, error) {
	rootAbs, err := filepath.Abs(projectRoot)
	if err != nil {
		return "", err
	}

	target := inputPath
	if !filepath.IsAbs(target) {
		target = filepath.Join(rootAbs, target)
	}

	targetAbs, err := filepath.Abs(target)
	if err != nil {
		return "", err
	}

	if targetAbs != rootAbs && !strings.HasPrefix(targetAbs, rootAbs+string(filepath.Separator)) {
		return "", fmt.Errorf("path %s is outside workspace root %s", targetAbs, rootAbs)
	}

	return targetAbs, nil
}
