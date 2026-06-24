package tools

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"anng-cli/internal/contextkeys"
)

func TestWriteToolStateVerification(t *testing.T) {
	workspaceDir, err := os.MkdirTemp("", "test_write_workspace")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(workspaceDir)

	tempFile := filepath.Join(workspaceDir, "test_write.txt")

	if err := os.WriteFile(tempFile, []byte("original content"), 0644); err != nil {
		t.Fatal(err)
	}

	ctx := context.WithValue(context.Background(), contextkeys.SessionIDKey, "sess-write-test")
	ctx = context.WithValue(ctx, contextkeys.ProjectRootKey, workspaceDir)

	// Try writing without reading first — should fail
	args := map[string]interface{}{
		"file_path": "test_write.txt",
		"content":   "new content",
	}
	_, err = WriteTool(ctx, args)
	if err == nil || err.Error() != "Must read the full existing file before writing" {
		t.Errorf("Expected failure 'Must read the full existing file before writing', got: %v", err)
	}

	// Record read state manually as if ReadTool was called
	RecordFileState(ctx, tempFile, "original content")

	// Try writing again — should succeed now
	res, err := WriteTool(ctx, args)
	if err != nil {
		t.Fatalf("Write failed: %v", err)
	}
	if res != "Updated file." {
		t.Errorf("Expected 'Updated file.', got %q", res)
	}
}

func TestWriteToolNewFile(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "test_write_new")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	ctx := context.WithValue(context.Background(), contextkeys.ProjectRootKey, tmpDir)
	args := map[string]interface{}{
		"file_path": "brand_new.txt",
		"content":   "fresh content",
	}

	res, err := WriteTool(ctx, args)
	if err != nil {
		t.Fatalf("Write to new file failed: %v", err)
	}
	if res != "Created file." {
		t.Errorf("Expected 'Created file.', got %q", res)
	}
}

func TestWriteToolRejectsPathOutsideWorkspace(t *testing.T) {
	workspaceDir, err := os.MkdirTemp("", "test_write_outside_workspace")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(workspaceDir)

	ctx := context.WithValue(context.Background(), contextkeys.ProjectRootKey, workspaceDir)
	outsideFile := filepath.Join(os.TempDir(), "write_outside_workspace.txt")

	_, err = WriteTool(ctx, map[string]interface{}{
		"file_path": outsideFile,
		"content":   "x",
	})
	if err == nil {
		t.Fatal("expected write outside workspace to fail")
	}
}
