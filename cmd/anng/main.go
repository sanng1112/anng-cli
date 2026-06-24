package main

import (
	"errors"
	"strconv"
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
	// Bootstrap CLI execution
}
