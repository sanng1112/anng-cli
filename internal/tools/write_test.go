package tools

import (
	"context"
	"os"
	"testing"

	"anng-cli/internal/contextkeys"
)

func TestWriteToolStateVerification(t *testing.T) {
	tempFile, err := os.CreateTemp("", "test_write.txt")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(tempFile.Name())

	if err := os.WriteFile(tempFile.Name(), []byte("original content"), 0644); err != nil {
		t.Fatal(err)
	}

	ctx := context.WithValue(context.Background(), contextkeys.SessionIDKey, "sess-write-test")

	// Try writing without reading first — should fail
	args := map[string]interface{}{
		"file_path": tempFile.Name(),
		"content":   "new content",
	}
	_, err = WriteTool(ctx, args)
	if err == nil || err.Error() != "Must read the full existing file before writing" {
		t.Errorf("Expected failure 'Must read the full existing file before writing', got: %v", err)
	}

	// Record read state manually as if ReadTool was called
	RecordFileState(ctx, tempFile.Name(), "original content")

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

	ctx := context.Background()
	args := map[string]interface{}{
		"file_path": tmpDir + "/brand_new.txt",
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
