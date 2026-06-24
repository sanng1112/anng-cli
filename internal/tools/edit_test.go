package tools

import (
	"context"
	"os"
	"strings"
	"testing"
)

func TestEditTool(t *testing.T) {
	tempFile, err := os.CreateTemp("", "test_edit.txt")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(tempFile.Name())

	content := "line 1\nline 2\nline 3"
	if err := os.WriteFile(tempFile.Name(), []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	args := map[string]interface{}{
		"file_path":           tempFile.Name(),
		"target_content":      "line 2",
		"replacement_content": "line 2 modified",
		"start_line":          float64(2),
		"end_line":            float64(2),
	}

	res, err := EditTool(context.Background(), args)
	if err != nil {
		t.Fatalf("EditTool failed: %v", err)
	}

	if res != "Content replaced successfully" {
		t.Errorf("Expected 'Content replaced successfully', got %q", res)
	}

	updated, err := os.ReadFile(tempFile.Name())
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(updated), "line 2 modified") {
		t.Errorf("Expected updated content to contain modification, got %q", string(updated))
	}
}

func TestEditToolMissingArgs(t *testing.T) {
	_, err := EditTool(context.Background(), map[string]interface{}{})
	if err == nil {
		t.Error("Expected error for missing file_path, got nil")
	}
}
