package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"anng-cli/internal/config"
	"anng-cli/internal/tui"
	tea "github.com/charmbracelet/bubbletea"
)

const Version = "0.2.1"

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
		default:
			if strings.HasPrefix(argv[i], "-") {
				return opts, fmt.Errorf("unrecognized flag: %s", argv[i])
			}
			if opts.Prompt == "" {
				opts.Prompt = argv[i]
			} else {
				opts.Prompt += " " + argv[i]
			}
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

	home, _ := os.UserHomeDir()
	settingsPath := filepath.Join(cwd, ".anng", "settings.json")
	if _, err := os.Stat(settingsPath); os.IsNotExist(err) {
		settingsPath = filepath.Join(home, ".anng", "settings.json")
	}

	var modelName, apiKey, baseURL string
	var modelsList []string
	var autoAccept, planMode bool
	cfgLoaded, err := config.LoadConfig(settingsPath)
	if err == nil && cfgLoaded != nil {
		modelName = cfgLoaded.Model
		apiKey = cfgLoaded.ApiKey
		baseURL = cfgLoaded.BaseURL
		modelsList = cfgLoaded.Models
		autoAccept = cfgLoaded.AutoAccept
		planMode = cfgLoaded.PlanMode
	} else {
		modelName = os.Getenv("ANNG_MODEL")
		apiKey = os.Getenv("ANNG_API_KEY")
		baseURL = os.Getenv("ANNG_BASE_URL")
	}

	// CLI flags override config settings
	if opts.Yolo {
		autoAccept = true
	}
	if opts.Plan {
		planMode = true
	}

	cfg := tui.AppConfig{
		Version:       Version,
		ProjectRoot:   cwd,
		InitialPrompt: opts.Prompt,
		AutoAccept:    autoAccept,
		PlanMode:      planMode,
		MaxTurns:      opts.MaxTurns,
		Model:         modelName,
		ApiKey:        apiKey,
		BaseURL:       baseURL,
		Models:        modelsList,
		SettingsPath:  settingsPath,
	}

	model := tui.InitialModelWithConfig(cfg)
	p := tea.NewProgram(model, tea.WithAltScreen())
	tui.ProgramInstance = p
	if _, err := p.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "Error running TUI: %v\n", err)
		os.Exit(1)
	}
}
