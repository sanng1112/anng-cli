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

func TestParseCLIOptionsExtended(t *testing.T) {
	// Test unrecognized flag
	args := []string{"--invalid-flag"}
	_, err := ParseCLIOptions(args)
	if err == nil {
		t.Errorf("Expected error for unrecognized flag, got nil")
	}

	// Test positional prompt
	args = []string{"create", "a", "file"}
	opts, err := ParseCLIOptions(args)
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}
	if opts.Prompt != "create a file" {
		t.Errorf("Expected prompt 'create a file', got %q", opts.Prompt)
	}
}

func TestParseCLIOptionsSetsJsonAndVerbose(t *testing.T) {
	args := []string{"--json", "--verbose", "-p", "hello"}
	opts, err := ParseCLIOptions(args)
	if err != nil {
		t.Fatalf("ParseCLIOptions returned error: %v", err)
	}
	if !opts.Json {
		t.Fatal("expected Json to be true")
	}
	if !opts.Verbose {
		t.Fatal("expected Verbose to be true")
	}
}

func TestBuildRunModeUsesHeadlessWhenPromptIsPresent(t *testing.T) {
	opts := CLIOptions{Prompt: "hello"}
	if got := buildRunMode(opts); got != runModeHeadless {
		t.Fatalf("expected headless mode, got %q", got)
	}
}

func TestBuildRunModeUsesTUIWithoutPrompt(t *testing.T) {
	opts := CLIOptions{}
	if got := buildRunMode(opts); got != runModeTUI {
		t.Fatalf("expected TUI mode, got %q", got)
	}
}
