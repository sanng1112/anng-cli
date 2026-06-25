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

	// Resolve symlinks to prevent path traversal attacks
	rootEval, err := filepath.EvalSymlinks(rootAbs)
	if err != nil {
		// If the root itself doesn't exist yet (e.g., new project), fall back to absolute
		rootEval = rootAbs
	}

	target := inputPath
	if !filepath.IsAbs(target) {
		target = filepath.Join(rootAbs, target)
	}

	targetAbs, err := filepath.Abs(target)
	if err != nil {
		return "", err
	}

	// Resolve symlinks in the target path
	targetEval, err := filepath.EvalSymlinks(targetAbs)
	if err != nil {
		// Target may not exist yet (e.g., new file to create), so check directory component
		targetEval = targetAbs
	}

	if targetEval != rootEval && !strings.HasPrefix(targetEval, rootEval+string(filepath.Separator)) {
		return "", fmt.Errorf("path %s is outside workspace root %s (resolved: %s)", targetAbs, rootAbs, rootEval)
	}

	return targetAbs, nil
}
