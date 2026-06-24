package main

import (
	"testing"
)

func TestParseCLIOptions(t *testing.T) {
	args := []string{"--yolo", "-p", "create a server", "--max-turns", "15"}
	opts, err := ParseCLIOptions(args)
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}
	if !opts.Yolo {
		t.Errorf("Expected Yolo to be true")
	}
	if opts.Prompt != "create a server" {
		t.Errorf("Expected prompt to be 'create a server', got %q", opts.Prompt)
	}
	if opts.MaxTurns != 15 {
		t.Errorf("Expected MaxTurns to be 15, got %d", opts.MaxTurns)
	}
}
