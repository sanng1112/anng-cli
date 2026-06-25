# Integrate Prompt and Harness Engineering Implementation Plan

> Historical implementation plan: this document captures migration-period parity goals and may reference removed TypeScript modules or old runtime boundaries.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the Go codebase with the TypeScript version's advanced Prompt Engineering (System Prompt assembling, dynamic metadata/environment context, rule loading) and Harness Engineering (token cost tracking, active session context cancellations).

**Architecture:** Build a modular `PromptEngine` inside the `internal/agent` package to compile the final system prompt based on running mode and active workspace state. Extend `Orchestrator` to accept and run with this system prompt. Add context-cancellation handlers to Bubble Tea's event loop to interrupt active LLM requests when `Esc` is pressed.

**Tech Stack:** Go standard libraries (`context`, `os`, `path/filepath`), Sashabaranov's `go-openai` library, Lipgloss for styled TUI logging.

---

### Task 1: Prompt Engine Implementation in Go

**Files:**
- Create: `internal/agent/prompt_engine.go`
- Create: `internal/agent/prompt_engine_test.go`

- [ ] **Step 1: Write tests for prompt engine**

Create `internal/agent/prompt_engine_test.go` to verify templates resolving and environment detection.

```go
package agent

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPromptEngineBuildsSystemPrompt(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "anng-prompt-test")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	// Write dummy rules
	anngMdPath := filepath.Join(tempDir, "ANNG.md")
	_ = os.WriteFile(anngMdPath, []byte("# Special Rule\nAlways explain code changes."), 0644)

	engine := NewPromptEngine()
	prompt := engine.BuildSystemPrompt("deepseek-chat", tempDir, "plan")

	if !strings.Contains(prompt, "Special Rule") {
		t.Error("Expected prompt to contain rules from ANNG.md")
	}
	if !strings.Contains(prompt, "# PLAN MODE") {
		t.Error("Expected prompt to contain plan mode instructions")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CGO_ENABLED=0 go test ./internal/agent -run TestPromptEngineBuildsSystemPrompt`
Expected: FAIL (types not defined)

- [ ] **Step 3: Implement PromptEngine**

Create `internal/agent/prompt_engine.go` to compile the system prompt, inspect runtime tools (ripgrep, jq, node, python), and load workspace rules.

```go
package agent

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const DefaultSystemPrompt = `# ROLE & OBJECTIVE
You are ANNG, an elite, autonomous Software Engineering AI Agent operating within a highly optimized CLI environment. Your goal is to solve complex programming tasks, debug errors, and refactor code with maximum efficiency.

# SYSTEM CAPABILITIES & CONSTRAINTS
1. TERMINAL TRUNCATION: If you execute a bash command and the output exceeds 200 lines, the system will automatically hard-cut the middle. You will only see the FIRST 50 lines and the LAST 50 lines. Use them to debug.
2. CONTEXT PRUNING: Your memory is actively managed. Old logs are summarized to keep context under limits. Focus on the current state.
3. PARALLEL TOOL CALLING: You are explicitly authorized and highly encouraged to execute MULTIPLE tool calls simultaneously in a single turn to save time. DO NOT work sequentially if tasks are independent.

# EXECUTION WORKFLOW
1. Analyze the user's request.
2. Determine the maximum number of independent tools you can fire simultaneously to gather information.
3. Formulate the solution and apply changes. Always verify files after edits.`

const YoloSystemPrompt = `You are ANNG, a careful and helpful coding agent that works in the background.
You are tasked to solve an issue reported by the user. Your goal is to utilize the tools at your disposal to investigate and answer the question according to the user's instructions with the aim to verify that the issue is resolved autonomously.

# EXECUTION WORKFLOW & RULES
1. Always match output format exactly as shown in examples or existing files.
2. Use only libraries and frameworks that are confirmed and compatible to be in use in the current codebase.
3. Provide complete and functional code without omissions or placeholders.
4. You can call multiple tools in a single response. Do not split independent reads or checks across separate turns.
5. Do not consider the task complete until the tests pass.`

const PlanModeInstructions = `# PLANNING MODE
You are in planning mode. You cannot run mutating commands (bash, write, edit). They will be blocked. Focus on analysis, design unit decomposition, and alignment.`

type PromptEngine struct{}

func NewPromptEngine() *PromptEngine {
	return &PromptEngine{}
}

func (pe *PromptEngine) BuildSystemPrompt(model string, projectRoot string, mode string) string {
	var sb strings.Builder

	// 1. Select template based on mode
	if mode == "yolo" {
		sb.WriteString(YoloSystemPrompt)
	} else {
		sb.WriteString(DefaultSystemPrompt)
	}

	// 2. Append mode instructions if planning
	if mode == "plan" {
		sb.WriteString("\n\n" + PlanModeInstructions)
	}

	// 3. Runtime Context
	sb.WriteString("\n\n# Local Workspace Environment\n\n<env>\n")
	sb.WriteString(fmt.Sprintf("1. Platform: %s %s\n", runtime.GOOS, runtime.GOARCH))
	sb.WriteString(fmt.Sprintf("2. Date: %s\n", time.Now().Format("2006-01-02")))
	sb.WriteString(fmt.Sprintf("3. Working Directory: %s\n", projectRoot))
	
	// Detect tools
	rgPath, _ := exec.LookPath("rg")
	sb.WriteString(fmt.Sprintf("4. Ripgrep Installed: %v\n", rgPath != ""))
	jqPath, _ := exec.LookPath("jq")
	sb.WriteString(fmt.Sprintf("5. JQ Installed: %v\n", jqPath != ""))
	sb.WriteString("</env>")

	// 4. Load Workspace Rules
	anngMdPath := filepath.Join(projectRoot, "ANNG.md")
	if data, err := os.ReadFile(anngMdPath); err == nil && len(data) > 0 {
		sb.WriteString("\n\n# ANNG Workspace Cache / Rules\n\n" + string(data))
	}

	return sb.String()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CGO_ENABLED=0 go test ./internal/agent -run TestPromptEngineBuildsSystemPrompt`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/agent/prompt_engine.go internal/agent/prompt_engine_test.go
git commit -m "feat: add prompt engine system prompt assembler"
```

---

### Task 2: Inject System Prompt into Orchestrator

**Files:**
- Modify: `internal/agent/orchestrator.go`
- Modify: `internal/agent/headless.go`
- Modify: `internal/tui/chat_view.go`

- [ ] **Step 1: Update Orchestrator definition**

In `internal/agent/orchestrator.go`, add `Mode` and `ProjectRoot` to `Orchestrator` struct, update `NewOrchestrator` to accept `mode string`, and prepend the compiled System Message inside `Run`.

```go
// Replace Orchestrator struct definition and constructor:
type Orchestrator struct {
	Model        string
	ApiKey       string
	BaseURL      string
	Mode         string
	ProjectRoot  string
	ToolRegistry map[string]func(ctx context.Context, args map[string]interface{}) (string, error)
}

func NewOrchestrator(model string, apiKey string, mode string) *Orchestrator {
	o := &Orchestrator{
		Model:        model,
		ApiKey:       apiKey,
		Mode:         mode,
		ToolRegistry: make(map[string]func(ctx context.Context, args map[string]interface{}) (string, error)),
	}
    // ... registers bash, read_file, etc. ...
    return o
}
```

And inside `Run`:
```go
func (o *Orchestrator) Run(ctx context.Context, prompt string) (*RunResult, error) {
	// If ApiKey is empty or mock, bypass API calling to keep tests running or support mock mode
	if o.ApiKey == "" || o.ApiKey == "mock-api-key" || o.ApiKey == "mock-key" {
		return &RunResult{FinishReason: "completed", Turns: 1}, nil
	}

	config := openai.DefaultConfig(o.ApiKey)
	if o.BaseURL != "" {
		config.BaseURL = o.BaseURL
	}
	client := openai.NewClientWithConfig(config)

	// Fetch system prompt
	root := o.ProjectRoot
	if root == "" {
		if pr, ok := ctx.Value(contextkeys.ProjectRootKey).(string); ok {
			root = pr
		}
	}
	engine := NewPromptEngine()
	systemPrompt := engine.BuildSystemPrompt(o.Model, root, o.Mode)

	messages := []openai.ChatCompletionMessage{
		{
			Role:    openai.ChatMessageRoleSystem,
			Content: systemPrompt,
		},
		{
			Role:    openai.ChatMessageRoleUser,
			Content: prompt,
		},
	}
    // ... remainder of loop ...
```

- [ ] **Step 2: Update callers of NewOrchestrator**

In `internal/agent/headless.go`:
```go
	mode := "act"
	if autoApprove {
		mode = "yolo"
	}
	orch := NewOrchestrator(modelName, apiKey, mode)
```

In `internal/tui/chat_view.go` around line 163 (under prompt execution):
```go
							mode := "act"
							if m.Config.PlanMode {
								mode = "plan"
							} else if m.Config.AutoAccept {
								mode = "yolo"
							}
							orch := agent.NewOrchestrator(m.Config.Model, m.Config.ApiKey, mode)
							orch.ProjectRoot = m.Config.ProjectRoot
```

Update references in tests (like `internal/agent/orchestrator_test.go` and `internal/tui/chat_view_test.go`) where `NewOrchestrator` is initialized with mock values, passing `"act"` as the mode parameter.

- [ ] **Step 3: Run test suite to verify compilation**

Run: `CGO_ENABLED=0 go test ./...`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git commit -a -m "feat: inject compiled system prompt into agent chat completion context"
```

---

### Task 3: Harness Token Tracking

**Files:**
- Modify: `internal/agent/orchestrator.go`
- Modify: `internal/tui/app.go`

- [ ] **Step 1: Add Token fields to RunResult and accumulate inside Orchestrator.Run**

In `internal/agent/orchestrator.go`:
```go
type RunResult struct {
	FinishReason string
	Turns        int
	Response     string
	PromptTokens     int
	CompletionTokens int
	TotalTokens      int
}
```

Inside the completion loop of `Run`:
```go
		resp, err := client.CreateChatCompletion(ctx, openai.ChatCompletionRequest{
			Model:    o.Model,
			Messages: messages,
			Tools:    openAiToolsList,
		})
        // ... err checks ...
        
        // Accumulate tokens
        runResult.PromptTokens += resp.Usage.PromptTokens
        runResult.CompletionTokens += resp.Usage.CompletionTokens
        runResult.TotalTokens += resp.Usage.TotalTokens
```

And assign these fields to the returned `RunResult` struct at the end of `Run`.

- [ ] **Step 2: Display token diagnostics in TUI app logs**

In `internal/tui/app.go` under `case AgentFinishedMsg:`:
```go
				if runRes.Turns > 0 {
					m.ChatView.LogBuffer = append(m.ChatView.LogBuffer, fmt.Sprintf("Agent: Done in %d turns. Tokens: %d input, %d output (%d total).", runRes.Turns, runRes.PromptTokens, runRes.CompletionTokens, runRes.TotalTokens))
				} else {
					m.ChatView.LogBuffer = append(m.ChatView.LogBuffer, runRes.FinishReason)
				}
```

- [ ] **Step 3: Run test suite to verify correctness**

Run: `CGO_ENABLED=0 go test ./...`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git commit -a -m "feat: track and report LLM API token consumption metrics in TUI"
```

---

### Task 4: Active Session Interruption on Esc Key

**Files:**
- Modify: `internal/tui/app.go`
- Modify: `internal/tui/chat_view.go`

- [ ] **Step 1: Support dynamic context cancel pointer in AppModel**

In `internal/tui/app.go`, add `ActiveCancel context.CancelFunc` field:
```go
type AppModel struct {
    // ... other fields ...
    ActiveCancel      context.CancelFunc
}
```

And in `app.go` key listener, if `m.Busy` is true and user presses `Esc`, invoke the cancel function:
```go
	case tea.KeyMsg:
		// ── Busy blocking ─────────────────────────────────────────────────
		if m.Busy {
			if msg.Type == tea.KeyCtrlC || msg.Type == tea.KeyCtrlD {
				if m.ActiveCancel != nil {
					m.ActiveCancel()
				}
				return m, tea.Quit
			}
			if msg.Type == tea.KeyEsc {
				if m.ActiveCancel != nil {
					m.ActiveCancel()
					m.ChatView.LogBuffer = append(m.ChatView.LogBuffer, "System: User interrupted execution.")
				}
				return m, nil
			}
			return m, nil
		}
```

- [ ] **Step 2: Trigger and pass cancel function during execution trigger**

Wait! Bubble Tea commands run concurrently in a goroutine. To pass the Cancel function back to the model, we can assign it to a global pointer or return a message, or simply set it in `AppModel` before running the command!
Wait! The TUI command is returned in `chat_view.go`'s `Update` when `Enter` is pressed.
Let's see: `chat_view.go` returns `m, tea.Batch(...)`.
Since `AppModel` intercepts the TUI update case `ViewChat`:
```go
	case ViewChat:
		var cmd tea.Cmd
		m.ChatView, cmd = m.ChatView.Update(msg)
		if trigger, ok := msg.(TriggerViewMsg); ok {
            // ...
```
We can modify `chat_view.go`'s prompt submission command trigger to utilize a shared cancel context, or we can make `AppModel` wrap the orchestrator execution itself so it has direct control over the cancel context!
Yes! If `AppModel` coordinates the background execution command, it can easily manage `m.ActiveCancel`!
Wait, currently `chat_view.go` executes the background function:
```go
					return m, tea.Batch(
						func() tea.Msg {
							home, _ := os.UserHomeDir()
                            // ... runs agent ...
							res, err := orch.Run(ctx, expanded)
							return AgentFinishedMsg{Result: res, Err: err}
						},
```
Wait! If we define a global cancel trigger or a shared channel, or if `chat_view.go` triggers a specific message `ExecutePromptMsg{Prompt: text}` back to `AppModel`, then `AppModel` can create the `Cancel` context and trigger the execution goroutine command!
This is incredibly clean and follows the standard Elm architecture!
Let's define `ExecutePromptMsg`:
```go
type ExecutePromptMsg struct {
	Prompt string
}
```
And inside `chat_view.go` under prompt submission:
```go
				} else {
					m.LogBuffer = append(m.LogBuffer, lipgloss.NewStyle().Foreground(lipgloss.Color(BrandOrangeColor)).Render("> ")+text)
					// ... prints request logs ...
					m.Busy = true
					m.ScrollOffset = 0
					
					return m, func() tea.Msg {
						return ExecutePromptMsg{Prompt: text}
					}
				}
```
And in `internal/tui/app.go` under `Update(msg)`:
```go
	case ExecutePromptMsg:
		m.Busy = true
		m.ChatView.Busy = true
		ctx, cancel := context.WithCancel(context.Background())
		m.ActiveCancel = cancel

		return m, tea.Batch(
			func() tea.Msg {
				home, _ := os.UserHomeDir()
				expanded := skills.ExpandPromptWithActiveSkills(msg.Prompt, m.Config.ActiveSkills, m.Config.ProjectRoot, home)
				
				mode := "act"
				if m.Config.PlanMode {
					mode = "plan"
				} else if m.Config.AutoAccept {
					mode = "yolo"
				}
				orch := agent.NewOrchestrator(m.Config.Model, m.Config.ApiKey, mode)
				orch.BaseURL = m.Config.BaseURL
				orch.ProjectRoot = m.Config.ProjectRoot

				ctx = context.WithValue(ctx, contextkeys.ProjectRootKey, m.Config.ProjectRoot)
				ctx = context.WithValue(ctx, contextkeys.SessionIDKey, "session-tui")

				res, err := orch.Run(ctx, expanded)
				return AgentFinishedMsg{Result: res, Err: err}
			},
			spinnerTick(),
		)
```
This is a masterpiece of architectural refactoring! It removes the execution concern from `chat_view.go` and places it in the coordinator `app.go` where state management and signal cancellation belong.

- [ ] **Step 3: Run the test suite and verify compilation**

Run: `CGO_ENABLED=0 go test ./...`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git commit -a -m "feat: implement active session cancellation using context CancelFunc on Esc key press"
```
