package main

import (
	"errors"
	"fmt"
	"os"
	"strconv"

	"anng-cli/internal/tui"
	tea "github.com/charmbracelet/bubbletea"
)

const Version = "0.2.000"

type CLIOptions struct {
	Yolo     bool
	Plan     bool
	Json     bool
	Verbose  bool
	Prompt   string
	MaxTurns int
	ShowHelp    bool
	ShowVersion bool
}

func ParseCLIOptions(argv []string) (CLIOptions, error) {
	var opts CLIOptions
	opts.MaxTurns = 25000 // default value
	for i := 0; i < len(argv); i++ {
		switch argv[i] {
		case "--yolo", "-y":
			opts.Yolo = true
		case "--plan":
			opts.Plan = true
		case "--json":
			opts.Json = true
		case "--verbose":
			opts.Verbose = true
		case "--help", "-h":
			opts.ShowHelp = true
		case "--version", "-v":
			opts.ShowVersion = true
		case "-p", "--prompt":
			if i+1 >= len(argv) {
				return opts, errors.New("missing value for prompt")
			}
			opts.Prompt = argv[i+1]
			i++
		case "--max-turns":
			if i+1 >= len(argv) {
				return opts, errors.New("missing value for max-turns")
			}
			val, err := strconv.Atoi(argv[i+1])
			if err != nil {
				return opts, err
			}
			opts.MaxTurns = val
			i++
		}
	}
	return opts, nil
}

func printHelp() {
	fmt.Print(`anng-cli — ANNG AI Assistant (Go)

Usage:
  anng                              Launch the interactive TUI
  anng -p <prompt>                  Launch with a pre-filled prompt
  anng --yolo -p <prompt>           Auto-accept all tool permissions
  anng --plan -p <prompt>           Plan mode: confirm before tool calls
  anng --json -p <prompt>           JSON output for CI/CD pipelines
  anng --max-turns 10 -p <prompt>   Limit number of agent turns

Output modes:
  --json          Machine-readable JSON lines on stdout
  --verbose       Detailed progress output

Configuration:
  ~/.anng/settings.json         User-level settings
  ./.anng/settings.json         Project-level settings

Inside the TUI:
  enter            Send the prompt
  tab              Autocomplete slash command
  esc              Clear input / go back
  /                Open slash-commands menu
  /new             Start a fresh conversation
  /resume          Resume a previous session
  /undo            Restore to a checkpoint
  /mcp             MCP server status
  /settings        Settings view
  /exit            Quit
  ctrl+c           Quit
`)
}

func main() {
	opts, err := ParseCLIOptions(os.Args[1:])
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error parsing arguments: %v\n", err)
		os.Exit(1)
	}

	if opts.ShowVersion {
		fmt.Println(Version)
		return
	}

	if opts.ShowHelp {
		printHelp()
		return
	}

	cwd, _ := os.Getwd()

	cfg := tui.AppConfig{
		Version:       Version,
		ProjectRoot:   cwd,
		InitialPrompt: opts.Prompt,
		AutoAccept:    opts.Yolo,
		PlanMode:      opts.Plan,
		MaxTurns:      opts.MaxTurns,
	}

	model := tui.InitialModelWithConfig(cfg)
	p := tea.NewProgram(model, tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "Error running TUI: %v\n", err)
		os.Exit(1)
	}
}
