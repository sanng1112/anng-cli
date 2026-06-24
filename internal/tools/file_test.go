package tools

import (
	"os"
	"testing"
)

func TestReplaceFileContent(t *testing.T) {
	tempFile, err := os.CreateTemp("", "test_file.txt")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(tempFile.Name())

	content := "Line 1\nLine 2\nLine 3\n"
	if err := os.WriteFile(tempFile.Name(), []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	err = ReplaceFileContent(tempFile.Name(), "Line 2", "Line Two Modified", 2, 2)
	if err != nil {
		t.Fatalf("Replace failed: %v", err)
	}

	updated, err := os.ReadFile(tempFile.Name())
	if err != nil {
		t.Fatal(err)
	}

	expected := "Line 1\nLine Two Modified\nLine 3\n"
	if string(updated) != expected {
		t.Errorf("Expected %q, got %q", expected, string(updated))
	}
}
