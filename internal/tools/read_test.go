package tools

import (
	"context"
	"os"
	"strings"
	"testing"
)

func TestReadTool(t *testing.T) {
	tempFile, err := os.CreateTemp("", "test_read.txt")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(tempFile.Name())

	content := "Line 1\nLine 2\nLine 3\nLine 4\n"
	if err := os.WriteFile(tempFile.Name(), []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	args := map[string]interface{}{
		"file_path":  tempFile.Name(),
		"start_line": float64(2),
		"end_line":   float64(3),
	}

	res, err := ReadTool(context.Background(), args)
	if err != nil {
		t.Fatalf("ReadTool failed: %v", err)
	}

	if !strings.Contains(res, "2: Line 2") || !strings.Contains(res, "3: Line 3") {
		t.Errorf("Expected lines 2 and 3 with line numbers, got: %q", res)
	}
}

func TestReadToolFullFile(t *testing.T) {
	tempFile, err := os.CreateTemp("", "test_read_full.txt")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(tempFile.Name())

	content := "alpha\nbeta\ngamma"
	if err := os.WriteFile(tempFile.Name(), []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	args := map[string]interface{}{
		"file_path": tempFile.Name(),
	}

	res, err := ReadTool(context.Background(), args)
	if err != nil {
		t.Fatalf("ReadTool failed: %v", err)
	}

	if !strings.Contains(res, "1: alpha") || !strings.Contains(res, "3: gamma") {
		t.Errorf("Expected full file with line numbers, got: %q", res)
	}
}

func TestReadToolDirectory(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "test_read_dir")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	args := map[string]interface{}{
		"file_path": tempDir,
	}

	_, err = ReadTool(context.Background(), args)
	if err == nil {
		t.Error("Expected error when reading a directory, got nil")
	}
}
