package tools

import (
	"context"
	"strings"
	"testing"
)

func TestExecuteBashCommand(t *testing.T) {
	output, err := ExecuteBashCommand(context.Background(), "echo 'Hello ANNG'", "/tmp")
	if err != nil {
		t.Fatalf("Bash tool execution failed: %v", err)
	}
	if !strings.Contains(output, "Hello ANNG") {
		t.Errorf("Expected output to contain 'Hello ANNG', got %q", output)
	}
}
