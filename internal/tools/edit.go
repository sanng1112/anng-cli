package tools

import (
	"context"
	"errors"

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

	filePath, err := resolveWorkspacePath(projectRoot, filePathVal)
	if err != nil {
		return "", err
	}

	err = ReplaceFileContent(filePath, targetVal, replacementVal, int(startLineVal), int(endLineVal))
	if err != nil {
		return "", err
	}

	return "Content replaced successfully", nil
}

// MultiEditTool applies multiple replacement chunks to a file.
func MultiEditTool(ctx context.Context, args map[string]interface{}) (string, error) {
	filePathVal, ok := args["file_path"].(string)
	if !ok || filePathVal == "" {
		return "", errors.New("missing required argument 'file_path'")
	}

	chunksRaw, ok := args["replacement_chunks"].([]interface{})
	if !ok {
		chunksRaw, ok = args["chunks"].([]interface{})
	}
	if !ok {
		return "", errors.New("missing or invalid required argument 'replacement_chunks'")
	}

	var chunks []ReplacementChunk
	for _, cr := range chunksRaw {
		cMap, ok := cr.(map[string]interface{})
		if !ok {
			continue
		}
		tc, _ := cMap["target_content"].(string)
		rc, _ := cMap["replacement_content"].(string)
		sl, _ := cMap["start_line"].(float64)
		el, _ := cMap["end_line"].(float64)

		chunks = append(chunks, ReplacementChunk{
			TargetContent:      tc,
			ReplacementContent: rc,
			StartLine:          int(sl),
			EndLine:            int(el),
		})
	}

	projectRoot := "."
	if pr, ok := ctx.Value(contextkeys.ProjectRootKey).(string); ok {
		projectRoot = pr
	}

	filePath, err := resolveWorkspacePath(projectRoot, filePathVal)
	if err != nil {
		return "", err
	}

	err = MultiReplaceFileContent(filePath, chunks)
	if err != nil {
		return "", err
	}

	return "Multiple contents replaced successfully", nil
}
