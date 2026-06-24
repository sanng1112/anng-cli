package tools

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"anng-cli/internal/contextkeys"
)

func TestReadTool(t *testing.T) {
	workspaceDir, err := os.MkdirTemp("", "test_read_workspace")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(workspaceDir)

	tempFile := filepath.Join(workspaceDir, "test_read.txt")

	content := "Line 1\nLine 2\nLine 3\nLine 4\n"
	if err := os.WriteFile(tempFile, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	ctx := context.WithValue(context.Background(), contextkeys.ProjectRootKey, workspaceDir)
	args := map[string]interface{}{
		"file_path":  "test_read.txt",
		"start_line": float64(2),
		"end_line":   float64(3),
	}

	res, err := ReadTool(ctx, args)
	if err != nil {
		t.Fatalf("ReadTool failed: %v", err)
	}

	if !strings.Contains(res, "2: Line 2") || !strings.Contains(res, "3: Line 3") {
		t.Errorf("Expected lines 2 and 3 with line numbers, got: %q", res)
	}
}

func TestReadToolFullFile(t *testing.T) {
	workspaceDir, err := os.MkdirTemp("", "test_read_full_workspace")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(workspaceDir)

	tempFile := filepath.Join(workspaceDir, "test_read_full.txt")

	content := "alpha\nbeta\ngamma"
	if err := os.WriteFile(tempFile, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	ctx := context.WithValue(context.Background(), contextkeys.ProjectRootKey, workspaceDir)
	args := map[string]interface{}{
		"file_path": "test_read_full.txt",
	}

	res, err := ReadTool(ctx, args)
	if err != nil {
		t.Fatalf("ReadTool failed: %v", err)
	}

	if !strings.Contains(res, "1: alpha") || !strings.Contains(res, "3: gamma") {
		t.Errorf("Expected full file with line numbers, got: %q", res)
	}
}

func TestReadToolDirectory(t *testing.T) {
	workspaceDir, err := os.MkdirTemp("", "test_read_dir_workspace")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(workspaceDir)

	dirPath := filepath.Join(workspaceDir, "subdir")
	if err := os.MkdirAll(dirPath, 0755); err != nil {
		t.Fatal(err)
	}

	ctx := context.WithValue(context.Background(), contextkeys.ProjectRootKey, workspaceDir)
	args := map[string]interface{}{
		"file_path": "subdir",
	}

	_, err = ReadTool(ctx, args)
	if err == nil {
		t.Error("Expected error when reading a directory, got nil")
	}
}

func TestReadToolRejectsPathOutsideWorkspace(t *testing.T) {
	workspaceDir, err := os.MkdirTemp("", "test_read_outside_workspace")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(workspaceDir)

	outsideFile := filepath.Join(os.TempDir(), "read_outside_workspace.txt")
	if err := os.WriteFile(outsideFile, []byte("secret"), 0644); err != nil {
		t.Fatal(err)
	}
	defer os.Remove(outsideFile)

	ctx := context.WithValue(context.Background(), contextkeys.ProjectRootKey, workspaceDir)
	_, err = ReadTool(ctx, map[string]interface{}{"file_path": outsideFile})
	if err == nil {
		t.Fatal("expected read outside workspace to fail")
	}
}

func TestInvariantFileToolsStayInsideWorkspace(t *testing.T) {
	TestReadToolRejectsPathOutsideWorkspace(t)
}
