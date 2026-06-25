# Fixing Codebase Bugs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve all 13 logical, UI/UX, and CLI parser defects documented in `analysis_results.md` to make the `anng` tool fully functional.

**Architecture:** We will modify `cmd/anng/main.go`, `internal/agent/orchestrator.go`, `internal/tui/app.go`, `internal/tui/chat_view.go`, `internal/tui/settings_view.go`, `internal/tui/list_views.go`, `internal/tui/model_skills_views.go`, and `internal/tui/permission_prompt_view.go` to inject proper API tool calling schema, file-history resuming/compaction, async bash execution background workers, correct settings precedence, and scrollable viewport TUI updates.

**Tech Stack:** Go (Golang), Bubble Tea (TUI), Lipgloss (styling), OpenAI API.

---

### Task 1: CLI Parser & Precedence Fixes (`cmd/anng/main.go`)

**Files:**
* Modify: `cmd/anng/main.go`
* Test: `cmd/anng/main_test.go`

- [ ] **Step 1: Implement CLI Precedence & Parameter Logic**

Fix `main.go` resolution logic:
1. Accept positional args as `opts.Prompt`.
2. Fail and exit with status code 1 on unrecognized arguments.
3. Correct `settings.json` precedence: local path `./.anng/settings.json` first, then fallback to global `~/.anng/settings.json`.

```go
// Replace ParseCLIOptions in main.go
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
```

Correct path fallback around line 120 in `main.go`:
```go
	home, _ := os.UserHomeDir()
	settingsPath := filepath.Join(".anng", "settings.json")
	if _, err := os.Stat(settingsPath); os.IsNotExist(err) {
		settingsPath = filepath.Join(home, ".anng", "settings.json")
	}
```

- [ ] **Step 2: Compile & verify help outputs**

Run: `conda run -n go_env env CGO_ENABLED=0 go build -o anng ./cmd/anng/main.go`
Expected: Success

- [ ] **Step 3: Commit**

```bash
git add cmd/anng/main.go
git commit -m "fix: resolve CLI settings precedence and handle unrecognized flags"
```

---

### Task 2: OpenAI API Tool Calling & Context Compaction (`internal/agent/orchestrator.go`)

**Files:**
* Modify: `internal/agent/orchestrator.go`

- [ ] **Step 1: Declare tool definitions and compact history context**

Modify `orchestrator.go` to attach tools schema list, parse tokenizer compaction, and check context boundaries:
```go
package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"os"

	"anng-cli/internal/contextkeys"
	"anng-cli/internal/tokenizer"
	"anng-cli/internal/tools"
	"github.com/sashabaranov/go-openai"
)

var openAiToolsList = []openai.Tool{
	{
		Type: openai.ToolTypeFunction,
		Function: &openai.FunctionDefinition{
			Name:        "bash",
			Description: "Propose a command to run on the system (bash shell). Use Cwd for directory.",
			Parameters: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"command": map[string]interface{}{"type": "string"},
					"cwd":     map[string]interface{}{"type": "string"},
				},
				"required": []string{"command"},
			},
		},
	},
	{
		Type: openai.ToolTypeFunction,
		Function: &openai.FunctionDefinition{
			Name:        "read_file",
			Description: "Read the content of a file from the workspace path.",
			Parameters: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"file_path": map[string]interface{}{"type": "string"},
				},
				"required": []string{"file_path"},
			},
		},
	},
	{
		Type: openai.ToolTypeFunction,
		Function: &openai.FunctionDefinition{
			Name:        "write_to_file",
			Description: "Create a new file or overwrite an existing file.",
			Parameters: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"file_path": map[string]interface{}{"type": "string"},
					"content":   map[string]interface{}{"type": "string"},
				},
				"required": []string{"file_path", "content"},
			},
		},
	},
}
```

Update `Orchestrator.Run` to call `tokenizer.ShouldCompactContext` and add the `Tools` parameters.

- [ ] **Step 2: Commit**

```bash
git add internal/agent/orchestrator.go
git commit -m "feat: attach ToolCalling parameters to OpenAI ChatCompletion request and enable history compaction"
```

---

### Task 3: Asynchronous Non-blocking Bash Executions (`internal/tui/chat_view.go`)

**Files:**
* Modify: `internal/tui/chat_view.go`
* Modify: `internal/tui/app.go`

- [ ] **Step 1: Implement background command execution**

Instead of running `orch.Run(...)` directly on the main Bubble Tea update thread, we return a `tea.Cmd` that spawns the agent loop, preventing TUI freeze. We also implement spinner tick timers to spin `⠋` character.

- [ ] **Step 2: Commit**

```bash
git add internal/tui/chat_view.go internal/tui/app.go
git commit -m "refactor: run agent processes asynchronously in background to prevent TUI blocking"
```

---

### Task 4: Functional Sessions Resume & Checkpoint Restore (`internal/tui/app.go`)

**Files:**
* Modify: `internal/tui/app.go`
* Modify: `internal/tui/list_views.go`

- [ ] **Step 1: Read session history file & restore state**

Open and unmarshal `.jsonl` files into `domain.Session` to populate `ChatView.LogBuffer` when `/resume` or `/undo` is triggered. Run `git checkout` commands using standard subprocess execution during `/undo` checkpoint restore.

- [ ] **Step 2: Run all compiler checks**

Run: `conda run -n go_env env CGO_ENABLED=0 go build -o anng ./cmd/anng/main.go`
Expected: Compile success

- [ ] **Step 3: Commit**

```bash
git add internal/tui/app.go internal/tui/list_views.go
git commit -m "feat: read session histories and execute real git checkout checkpoints during undo"
```

---
