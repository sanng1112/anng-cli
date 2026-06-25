package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"anng-cli/internal/agent"
	"anng-cli/internal/config"
	"anng-cli/internal/mcp"
	"anng-cli/internal/tui"
	tea "github.com/charmbracelet/bubbletea"
)

const Version = "0.2.2"

type CLIOptions struct {
	Yolo        bool
	Plan        bool
	Json        bool
	Verbose     bool
	Prompt      string
	MaxTurns    int
	ShowHelp    bool
	ShowVersion bool
}

type runMode string

const (
	runModeTUI      runMode = "tui"
	runModeHeadless runMode = "headless"
)

func ParseCLIOptions(argv []string) (CLIOptions, error) {
	var opts CLIOptions
	opts.MaxTurns = 50 // default max turns for headless mode
	for i := 0; i < len(argv); i++ {
		switch argv[i] {
		case "--yolo", "-y":
			opts.Yolo = true
		case "--plan":
			opts.Plan = true
		case "--json":
			opts.Json = true
		case "--verbose", "-v":
			opts.Verbose = true
		case "--help", "-h":
			opts.ShowHelp = true
		case "--version":
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
  anng --plan -p <prompt>           Plan mode: block mutating tools
  anng --json -p <prompt>           JSON output for CI/CD pipelines
  anng --max-turns 10 -p <prompt>   Limit number of agent turns

Output modes:
  --json          Machine-readable JSON lines on stdout
  --verbose       Extra headless diagnostics on stderr

Configuration:
  ~/.anng/settings.json         User-level settings
  ./.anng/settings.json         Project-level settings

Inside the TUI:
  enter            Send the prompt
  tab              Autocomplete slash command
  esc              Clear input / go back
  ctrl+j           Insert newline
  /                Open slash-commands menu
  /new             Fresh conversation
  /continue        Continue / resume session
  /resume          Resume a previous session
  /undo            Restore a git checkpoint
  /mcp             MCP server status
  /settings        Settings view
  /model           Choose AI model
  /skills          List available skills
  /raw             Toggle display mode
  /init            Create AGENTS.md file
  /team            Team orchestration
  /team-dp         Data-parallel agents
  /team-wf         Sequential workflow pipeline
  /exit            Quit
  ctrl+c           Quit
`)
}

func buildRunMode(opts CLIOptions) runMode {
	if strings.TrimSpace(opts.Prompt) != "" {
		return runModeHeadless
	}
	return runModeTUI
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
	var provider string
	var geminiApiKey, geminiBaseURL string
	var modelsList []string
	var autoAccept, planMode, thinkingEnabled bool
	var reasoningEffort string

	cfgLoaded, err := config.LoadConfig(settingsPath)
	if err == nil && cfgLoaded != nil {
		modelName = cfgLoaded.Model
		apiKey = cfgLoaded.ApiKey
		baseURL = cfgLoaded.BaseURL
		provider = cfgLoaded.Provider
		geminiApiKey = cfgLoaded.GeminiApiKey
		geminiBaseURL = cfgLoaded.GeminiBaseURL
		modelsList = cfgLoaded.Models
		autoAccept = cfgLoaded.AutoAccept
		planMode = cfgLoaded.PlanMode
		thinkingEnabled = cfgLoaded.ThinkingEnabled
		reasoningEffort = cfgLoaded.ReasoningEffort
	} else {
		modelName = os.Getenv("ANNG_MODEL")
		apiKey = os.Getenv("ANNG_API_KEY")
		baseURL = os.Getenv("ANNG_BASE_URL")
		provider = os.Getenv("ANNG_PROVIDER")
		geminiApiKey = os.Getenv("GEMINI_API_KEY")
		geminiBaseURL = os.Getenv("GEMINI_BASE_URL")
		if os.Getenv("ANNG_THINKING_ENABLED") == "true" {
			thinkingEnabled = true
		}
		reasoningEffort = os.Getenv("ANNG_REASONING_EFFORT")
	}

	resolvedProvider := agent.ResolveProvider(provider, modelName, baseURL)
	provider = string(resolvedProvider)
	apiKey, baseURL = agent.ResolveCredentials(resolvedProvider, apiKey, baseURL, geminiApiKey, geminiBaseURL)
	if baseURL == "" {
		baseURL = agent.DefaultBaseURL(resolvedProvider)
	}

	// Default to thinking enabled for deepseek-v4 models if not explicitly set
	isV4Model := modelName == "deepseek-v4-flash" || modelName == "deepseek-v4-pro" || modelName == "deepseek-v4-flash-free" || modelName == "deepseek-v4-pro-free"
	if isV4Model && (err != nil || !thinkingEnabled) {
		thinkingEnabled = true
	}
	if reasoningEffort == "" && thinkingEnabled {
		reasoningEffort = "-"
	}

	// CLI flags override config settings
	if opts.Yolo {
		autoAccept = true
	}
	if opts.Plan {
		planMode = true
	}

	cfg := tui.AppConfig{
		Version:         Version,
		ProjectRoot:     cwd,
		InitialPrompt:   opts.Prompt,
		AutoAccept:      autoAccept,
		PlanMode:        planMode,
		MaxTurns:        opts.MaxTurns,
		Model:           modelName,
		ApiKey:          apiKey,
		BaseURL:         baseURL,
		Provider:        provider,
		GeminiApiKey:    geminiApiKey,
		GeminiBaseURL:   geminiBaseURL,
		Models:          modelsList,
		SettingsPath:    settingsPath,
		ThinkingEnabled: thinkingEnabled,
		ReasoningEffort: reasoningEffort,
	}

	mode := buildRunMode(opts)
	if mode == runModeHeadless {
		ctx := context.Background()
		res, err := agent.RunHeadless(ctx, opts.Prompt, autoAccept, planMode, opts.Json, opts.Verbose, opts.MaxTurns)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error running headless mode: %v\n", err)
			os.Exit(1)
		}
		if res.ExitCode != 0 {
			os.Exit(res.ExitCode)
		}
		return
	}

	model := tui.InitialModelWithConfig(cfg)
	mcpCtx, cancelMCP := context.WithCancel(context.Background())
	defer cancelMCP()
	if manager, errs, err := mcp.LoadManagerFromSettingsPath(mcpCtx, settingsPath); err == nil && manager != nil {
		model.MCPManager = manager
		if len(errs) > 0 {
			for _, connectErr := range errs {
				fmt.Fprintf(os.Stderr, "MCP warning: %v\n", connectErr)
			}
		}
		go manager.AutoReconnectLoop(mcpCtx, 30*time.Second)
		defer manager.DisconnectAll()
	}

	p := tea.NewProgram(model, tea.WithAltScreen())
	tui.ProgramInstance = p
	if _, err := p.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "Error running TUI: %v\n", err)
		os.Exit(1)
	}
}
