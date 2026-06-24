package main

import (
	"errors"
	"fmt"
	"os"
	"strconv"

	"anng-cli/internal/tui"
	tea "github.com/charmbracelet/bubbletea"
)

type CLIOptions struct {
	Yolo     bool
	Plan     bool
	Json     bool
	Verbose  bool
	Prompt   string
	MaxTurns int
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

func main() {
	opts, err := ParseCLIOptions(os.Args[1:])
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error parsing arguments: %v\n", err)
		os.Exit(1)
	}

	_ = opts // We can use options in the future

	p := tea.NewProgram(tui.InitialModel())
	if _, err := p.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "Error running TUI: %v\n", err)
		os.Exit(1)
	}
}
