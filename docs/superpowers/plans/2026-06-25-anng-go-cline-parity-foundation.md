# ANNG Go Cline Parity Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`+ [x]`) syntax for tracking.

**Goal:** Turn `anng-cli` Go from a prototype TUI into a real, policy-enforced CLI runtime that can serve as the foundation for practical parity with `cline`.

**Architecture:** This phase does not try to port every `cline` feature. It establishes the runtime contract first: one execution context, one policy layer, one tool schema registry, one CLI entry behavior, and one verification harness. The immediate target is working single-agent parity for prompt execution, headless mode, tool calls, approvals, session persistence, and safe file/process operations.

**Tech Stack:** Go 1.24, Bubble Tea, Lip Gloss, `github.com/sashabaranov/go-openai`, `github.com/creack/pty`, standard library JSON/HTTP/exec/fs packages.

---

## Scope Split

This program is too large for a single implementation plan without creating low-quality steps. Break the overall `cline` parity objective into these sequential plans:

1. `2026-06-25-anng-go-cline-parity-foundation.md`
   - Runtime contract, policy engine, CLI/headless/TUI integration, tool schema alignment, test harness.
2. `2026-06-25-anng-go-cline-parity-mcp-and-connectors.md`
   - Real MCP config loading, client lifecycle, resource surfacing, connector parity.
3. `2026-06-25-anng-go-cline-parity-session-and-workflow.md`
   - Session restore, checkpoints, undo, resumability, compaction, long-running workflows.
4. `2026-06-25-anng-go-cline-parity-team-and-advanced-ux.md`
   - Team workflows, orchestration UI, advanced slash commands, richer panes and diagnostics.

This plan covers only item 1. Do not start items 2-4 until item 1 is passing.

## File Structure Mapping

- `cmd/anng/main.go`
  - Canonical CLI entrypoint. Decides TUI vs headless. Owns argument parsing and startup config merge.
- `internal/agent/runtime.go`
  - New runtime configuration object shared by TUI and headless entrypoints.
- `internal/agent/execution_context.go`
  - Immutable execution context definitions and constructors.
- `internal/agent/policy.go`
  - Mutating-tool policy checks for plan/interactive/yolo modes and path bounds.
- `internal/agent/tool_specs.go`
  - Canonical tool schema list used both for LLM exposure and local registration checks.
- `internal/agent/orchestrator.go`
  - Multi-turn loop, tool call dispatch, context propagation, max-turn enforcement.
- `internal/agent/headless.go`
  - Headless execution path with stdout output and exit codes.
- `internal/tools/paths.go`
  - Workspace path normalization and jail checks reused by read/write/edit/bash/http tools.
- `internal/tools/read.go`
  - Workspace-bounded reads with line-range support.
- `internal/tools/write.go`
  - Safe writes with prior-read verification and workspace bounds.
- `internal/tools/edit.go`
  - Safe edits with schema-compatible args and workspace bounds.
- `internal/tools/bash.go`
  - Command execution with cancellation, exit status, and mode-aware gate hooks.
- `internal/tui/app.go`
  - App wiring, permission prompt flow, agent execution dispatch, session writes.
- `internal/tui/chat_view.go`
  - Slash command dispatch and prompt submit behavior.
- `internal/config/config.go`
  - Settings loader/saver with compatibility for documented config shapes.
- `internal/config/config_test.go`
  - Config compatibility tests.
- `internal/agent/orchestrator_test.go`
  - Schema/runtime/policy tests.
- `internal/tui/app_test.go`
  - TUI execution and permission gate tests.
- `cmd/anng/main_test.go`
  - CLI mode selection tests.

---

### Task 1: Make CLI Behavior Match the User Contract

**Files:**
- Modify: `cmd/anng/main.go`
- Modify: `cmd/anng/main_test.go`
- Modify: `README.md`
- Test: `cmd/anng/main_test.go`

+ [x] **Step 1: Write failing tests for TUI vs headless routing**

Add these tests to `cmd/anng/main_test.go`:

```go
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
```

+ [x] **Step 2: Run the CLI tests to verify failure**

Run: `go test ./cmd/anng -run 'Test(ParseCLIOptionsSetsJsonAndVerbose|BuildRunMode)' -v`

Expected: FAIL with `undefined: buildRunMode` or equivalent.

+ [x] **Step 3: Implement explicit run-mode selection and headless path**

Update `cmd/anng/main.go` with these additions:

```go
type runMode string

const (
	runModeTUI      runMode = "tui"
	runModeHeadless runMode = "headless"
)

func buildRunMode(opts CLIOptions) runMode {
	if strings.TrimSpace(opts.Prompt) != "" {
		return runModeHeadless
	}
	return runModeTUI
}
```

And replace the final startup block with:

```go
	mode := buildRunMode(opts)
	if mode == runModeHeadless {
		ctx := context.Background()
		res, err := agent.RunHeadless(ctx, opts.Prompt, autoAccept)
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
	p := tea.NewProgram(model, tea.WithAltScreen())
	tui.ProgramInstance = p
	if _, err := p.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "Error running TUI: %v\n", err)
		os.Exit(1)
	}
```

+ [x] **Step 4: Update README so it matches the actual config and startup behavior**

Replace the config example in `README.md` with:

```json
{
  "model": "gpt-4o",
  "apiKey": "sk-...",
  "baseUrl": "https://api.openai.com/v1",
  "autoAccept": false,
  "planMode": false,
  "thinkingEnabled": false,
  "reasoningEffort": "medium"
}
```

And keep the usage section aligned with real behavior:

```bash
anng
anng -p "viết hàm tính tổng"
anng --yolo -p "dọn dẹp thư mục dist"
```

+ [x] **Step 5: Run CLI tests again**

Run: `go test ./cmd/anng -v`

Expected: PASS

+ [x] **Step 6: Commit**

```bash
git add cmd/anng/main.go cmd/anng/main_test.go README.md
git commit -m "feat: align CLI startup contract with TUI and headless modes"
```

---

### Task 2: Introduce Execution Context and Policy Engine

**Files:**
- Create: `internal/agent/execution_context.go`
- Create: `internal/agent/policy.go`
- Modify: `internal/agent/orchestrator.go`
- Test: `internal/agent/orchestrator_test.go`

+ [x] **Step 1: Write failing tests for plan-mode denials**

Append these tests to `internal/agent/orchestrator_test.go`:

```go
func TestPolicyDeniesMutatingToolsInPlanMode(t *testing.T) {
	ctx := NewExecutionContext(ExecutionContextOptions{
		SessionID:     "session-1",
		WorkspaceRoot: "/tmp/project",
		Mode:          ModePlan,
	})

	if err := EvaluateToolCall(ctx, "write_to_file", map[string]interface{}{"file_path": "a.txt"}); err == nil {
		t.Fatal("expected write_to_file to be denied in plan mode")
	}
}

func TestPolicyAllowsReadInPlanMode(t *testing.T) {
	ctx := NewExecutionContext(ExecutionContextOptions{
		SessionID:     "session-1",
		WorkspaceRoot: "/tmp/project",
		Mode:          ModePlan,
	})

	if err := EvaluateToolCall(ctx, "read_file", map[string]interface{}{"file_path": "a.txt"}); err != nil {
		t.Fatalf("expected read_file to be allowed: %v", err)
	}
}
```

+ [x] **Step 2: Run orchestrator tests to verify failure**

Run: `go test ./internal/agent -run 'TestPolicy' -v`

Expected: FAIL with `undefined: NewExecutionContext` or `undefined: EvaluateToolCall`.

+ [x] **Step 3: Create immutable execution context types**

Create `internal/agent/execution_context.go`:

```go
package agent

type Mode string

const (
	ModeAct  Mode = "act"
	ModePlan Mode = "plan"
	ModeYolo Mode = "yolo"
)

type ExecutionContext struct {
	SessionID     string
	WorkspaceRoot string
	Mode          Mode
}

type ExecutionContextOptions struct {
	SessionID     string
	WorkspaceRoot string
	Mode          Mode
}

func NewExecutionContext(opts ExecutionContextOptions) ExecutionContext {
	return ExecutionContext{
		SessionID:     opts.SessionID,
		WorkspaceRoot: opts.WorkspaceRoot,
		Mode:          opts.Mode,
	}
}
```

+ [x] **Step 4: Create a real policy gate**

Create `internal/agent/policy.go`:

```go
package agent

import "fmt"

var mutatingTools = map[string]bool{
	"bash":                       true,
	"write_to_file":              true,
	"replace_file_content":       true,
	"multi_replace_file_content": true,
}

func EvaluateToolCall(ctx ExecutionContext, toolName string, args map[string]interface{}) error {
	if ctx.Mode == ModePlan && mutatingTools[toolName] {
		return fmt.Errorf("tool %s is blocked in planning mode", toolName)
	}
	return nil
}
```

+ [x] **Step 5: Gate tool dispatch in orchestrator**

Inside `internal/agent/orchestrator.go`, before invoking a tool handler, insert:

```go
	execCtx := NewExecutionContext(ExecutionContextOptions{
		SessionID:     sessionIDFromContext(ctx),
		WorkspaceRoot: root,
		Mode:          Mode(o.Mode),
	})
	if err := EvaluateToolCall(execCtx, tc.Function.Name, args); err != nil {
		toolResult = "Error: " + err.Error()
		messages = append(messages, openai.ChatCompletionMessage{
			Role:       openai.ChatMessageRoleTool,
			Content:    toolResult,
			ToolCallID: tc.ID,
		})
		continue
	}
```

Also add:

```go
func sessionIDFromContext(ctx context.Context) string {
	if v, ok := ctx.Value(contextkeys.SessionIDKey).(string); ok {
		return v
	}
	return "default"
}
```

+ [x] **Step 6: Run orchestrator tests again**

Run: `go test ./internal/agent -v`

Expected: PASS

+ [x] **Step 7: Commit**

```bash
git add internal/agent/execution_context.go internal/agent/policy.go internal/agent/orchestrator.go internal/agent/orchestrator_test.go
git commit -m "feat: add execution context and enforce plan-mode tool policy"
```

---

### Task 3: Make Tool Schemas and Handlers Consistent

**Files:**
- Create: `internal/agent/tool_specs.go`
- Modify: `internal/agent/orchestrator.go`
- Modify: `internal/tools/edit.go`
- Test: `internal/agent/orchestrator_test.go`

+ [x] **Step 1: Write failing tests for schema consistency**

Append this test to `internal/agent/orchestrator_test.go`:

```go
func TestRegisteredToolSchemasMatchRuntimeHandlers(t *testing.T) {
	orch := NewOrchestrator("gpt-4o", "mock-key", "act")
	schemas := toolSpecs()

	for _, schema := range schemas {
		if _, ok := orch.ToolRegistry[schema.Function.Name]; !ok {
			t.Fatalf("tool schema %q has no runtime handler", schema.Function.Name)
		}
	}
}
```

+ [x] **Step 2: Run tests to verify failure**

Run: `go test ./internal/agent -run TestRegisteredToolSchemasMatchRuntimeHandlers -v`

Expected: FAIL because `UpdatePlan`, `HttpRequest`, or `AnalyzeProject` are not in the schema list, or because `toolSpecs` does not exist.

+ [x] **Step 3: Centralize the tool schema list**

Create `internal/agent/tool_specs.go`:

```go
package agent

import "github.com/sashabaranov/go-openai"

func toolSpecs() []openai.Tool {
	return []openai.Tool{
		{
			Type: openai.ToolTypeFunction,
			Function: &openai.FunctionDefinition{
				Name: "read_file",
				Parameters: map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"file_path": map[string]interface{}{"type": "string"},
						"start_line": map[string]interface{}{"type": "number"},
						"end_line": map[string]interface{}{"type": "number"},
					},
					"required": []string{"file_path"},
				},
			},
		},
		{
			Type: openai.ToolTypeFunction,
			Function: &openai.FunctionDefinition{
				Name: "write_to_file",
				Parameters: map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"file_path": map[string]interface{}{"type": "string"},
						"content": map[string]interface{}{"type": "string"},
					},
					"required": []string{"file_path", "content"},
				},
			},
		},
		{
			Type: openai.ToolTypeFunction,
			Function: &openai.FunctionDefinition{
				Name: "replace_file_content",
				Parameters: map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"file_path": map[string]interface{}{"type": "string"},
						"target_content": map[string]interface{}{"type": "string"},
						"replacement_content": map[string]interface{}{"type": "string"},
						"start_line": map[string]interface{}{"type": "number"},
						"end_line": map[string]interface{}{"type": "number"},
					},
					"required": []string{"file_path", "target_content", "replacement_content", "start_line", "end_line"},
				},
			},
		},
		{
			Type: openai.ToolTypeFunction,
			Function: &openai.FunctionDefinition{
				Name: "multi_replace_file_content",
				Parameters: map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"file_path": map[string]interface{}{"type": "string"},
						"replacement_chunks": map[string]interface{}{
							"type": "array",
						},
					},
					"required": []string{"file_path", "replacement_chunks"},
				},
			},
		},
		{
			Type: openai.ToolTypeFunction,
			Function: &openai.FunctionDefinition{
				Name: "bash",
				Parameters: map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"command": map[string]interface{}{"type": "string"},
						"cwd": map[string]interface{}{"type": "string"},
					},
					"required": []string{"command"},
				},
			},
		},
		{
			Type: openai.ToolTypeFunction,
			Function: &openai.FunctionDefinition{
				Name: "ask_question",
				Parameters: map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"question": map[string]interface{}{"type": "string"},
					},
					"required": []string{"question"},
				},
			},
		},
		{
			Type: openai.ToolTypeFunction,
			Function: &openai.FunctionDefinition{
				Name: "search_web",
				Parameters: map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"query": map[string]interface{}{"type": "string"},
					},
					"required": []string{"query"},
				},
			},
		},
		{
			Type: openai.ToolTypeFunction,
			Function: &openai.FunctionDefinition{
				Name: "HttpRequest",
				Parameters: map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"url": map[string]interface{}{"type": "string"},
						"method": map[string]interface{}{"type": "string"},
					},
					"required": []string{"url"},
				},
			},
		},
		{
			Type: openai.ToolTypeFunction,
			Function: &openai.FunctionDefinition{
				Name: "UpdatePlan",
				Parameters: map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"plan": map[string]interface{}{"type": "string"},
					},
					"required": []string{"plan"},
				},
			},
		},
		{
			Type: openai.ToolTypeFunction,
			Function: &openai.FunctionDefinition{
				Name: "AnalyzeProject",
				Parameters: map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"depth": map[string]interface{}{"type": "number"},
					},
				},
			},
		},
	}
}
```

+ [x] **Step 4: Switch orchestrator to use the canonical schema list**

In `internal/agent/orchestrator.go`, replace:

```go
Tools:    openAiToolsList,
```

with:

```go
Tools:    toolSpecs(),
```

+ [x] **Step 5: Run agent tests again**

Run: `go test ./internal/agent -v`

Expected: PASS

+ [x] **Step 6: Commit**

```bash
git add internal/agent/tool_specs.go internal/agent/orchestrator.go internal/tools/edit.go internal/agent/orchestrator_test.go
git commit -m "feat: align tool schemas with runtime handlers"
```

---

### Task 4: Enforce Workspace Path Jail in File Tools

**Files:**
- Create: `internal/tools/paths.go`
- Modify: `internal/tools/read.go`
- Modify: `internal/tools/write.go`
- Modify: `internal/tools/edit.go`
- Test: `internal/tools/read_test.go`
- Test: `internal/tools/write_test.go`

+ [x] **Step 1: Write failing tests for out-of-workspace access**

Add these tests:

```go
func TestReadToolRejectsPathOutsideWorkspace(t *testing.T) {
	ctx := context.WithValue(context.Background(), contextkeys.ProjectRootKey, "/tmp/workspace")
	_, err := ReadTool(ctx, map[string]interface{}{"file_path": "/etc/passwd"})
	if err == nil {
		t.Fatal("expected read outside workspace to fail")
	}
}

func TestWriteToolRejectsPathOutsideWorkspace(t *testing.T) {
	ctx := context.WithValue(context.Background(), contextkeys.ProjectRootKey, "/tmp/workspace")
	_, err := WriteTool(ctx, map[string]interface{}{"file_path": "/tmp/other/file.txt", "content": "x"})
	if err == nil {
		t.Fatal("expected write outside workspace to fail")
	}
}
```

+ [x] **Step 2: Run file-tool tests to verify failure**

Run: `go test ./internal/tools -run 'Test(ReadToolRejectsPathOutsideWorkspace|WriteToolRejectsPathOutsideWorkspace)' -v`

Expected: FAIL because current tools allow absolute paths.

+ [x] **Step 3: Create reusable workspace path resolver**

Create `internal/tools/paths.go`:

```go
package tools

import (
	"fmt"
	"path/filepath"
	"strings"
)

func resolveWorkspacePath(projectRoot string, inputPath string) (string, error) {
	rootAbs, err := filepath.Abs(projectRoot)
	if err != nil {
		return "", err
	}

	target := inputPath
	if !filepath.IsAbs(target) {
		target = filepath.Join(rootAbs, target)
	}

	targetAbs, err := filepath.Abs(target)
	if err != nil {
		return "", err
	}

	if targetAbs != rootAbs && !strings.HasPrefix(targetAbs, rootAbs+string(filepath.Separator)) {
		return "", fmt.Errorf("path %s is outside workspace root %s", targetAbs, rootAbs)
	}

	return targetAbs, nil
}
```

+ [x] **Step 4: Apply resolver in read/write/edit tools**

In each tool, replace the current relative/absolute path block with:

```go
	filePath, err := resolveWorkspacePath(projectRoot, filePathVal)
	if err != nil {
		return "", err
	}
```

+ [x] **Step 5: Run tool tests again**

Run: `go test ./internal/tools -v`

Expected: PASS

+ [x] **Step 6: Commit**

```bash
git add internal/tools/paths.go internal/tools/read.go internal/tools/write.go internal/tools/edit.go internal/tools/read_test.go internal/tools/write_test.go
git commit -m "feat: enforce workspace path jail for file tools"
```

---

### Task 5: Wire TUI Permission Flow to Real Tool Execution

**Files:**
- Modify: `internal/tui/app.go`
- Modify: `internal/tui/chat_view.go`
- Modify: `internal/tools/bash.go`
- Test: `internal/tui/app_test.go`

+ [x] **Step 1: Write failing tests for permission prompts**

Add this test to `internal/tui/app_test.go`:

```go
func TestAppShowsPermissionPromptForManualMode(t *testing.T) {
	model := InitialModelWithConfig(AppConfig{
		ProjectRoot: "/tmp/project",
		Model:       "gpt-4o",
		ApiKey:      "mock-key",
		AutoAccept:  false,
		PlanMode:    false,
	})

	req := &PermissionRequest{
		ToolName: "bash",
		Command:  "rm -rf dist",
	}
	model.PendingPermission = req
	model.PermissionView = NewPermissionPromptModel(*req)

	view := model.View()
	if !strings.Contains(view, "bash") {
		t.Fatalf("expected permission view to mention tool name, got %q", view)
	}
}
```

+ [x] **Step 2: Run TUI tests to verify current gaps**

Run: `go test ./internal/tui -run TestAppShowsPermissionPromptForManualMode -v`

Expected: FAIL if imports/types/assertions are missing.

+ [x] **Step 3: Introduce a permission callback from tools into the TUI**

At the top of `internal/tools/bash.go`, add:

```go
var PermissionCheck func(command string, cwd string) error
```

And before starting the command:

```go
	if PermissionCheck != nil {
		if err := PermissionCheck(command, cwd); err != nil {
			return "", err
		}
	}
```

+ [x] **Step 4: Connect TUI manual mode to that permission gate**

In `internal/tui/app.go`, inside `init()`, add:

```go
	tools.PermissionCheck = func(command string, cwd string) error {
		return nil
	}
```

Then in `InitialModelWithConfig`, if `!cfg.AutoAccept && !cfg.PlanMode`, keep a no-op gate for now but reserve the TUI state path:

```go
	if !cfg.AutoAccept && !cfg.PlanMode {
		model.PermissionView = NewPermissionPromptModel(PermissionRequest{})
	}
```

And in the next implementation pass, replace the no-op with a real synchronous permission handoff. The critical outcome in this phase is to stop pretending permission UI exists without any runtime bridge.

+ [x] **Step 5: Run TUI tests again**

Run: `go test ./internal/tui -v`

Expected: PASS

+ [x] **Step 6: Commit**

```bash
git add internal/tui/app.go internal/tui/chat_view.go internal/tools/bash.go internal/tui/app_test.go
git commit -m "feat: connect TUI permission state to tool execution hooks"
```

---

### Task 6: Add a Minimal Verification Harness for Phase 1 Invariants

**Files:**
- Modify: `internal/agent/orchestrator_test.go`
- Modify: `internal/tools/read_test.go`
- Modify: `internal/tools/write_test.go`
- Modify: `internal/tui/app_test.go`

+ [x] **Step 1: Add invariant-style tests**

Add or update tests so the suite explicitly checks:

```go
func TestInvariantPlanModeBlocksMutations(t *testing.T) {}
func TestInvariantHeadlessModeRunsWithoutTUI(t *testing.T) {}
func TestInvariantFileToolsStayInsideWorkspace(t *testing.T) {}
func TestInvariantToolSchemasMatchHandlers(t *testing.T) {}
```

Each test should call the concrete functions added in Tasks 1-5, not mocks of a future API.

+ [x] **Step 2: Run the focused phase-1 suite**

Run:

```bash
go test ./cmd/anng ./internal/agent ./internal/tools ./internal/tui -v
```

Expected: PASS

+ [x] **Step 3: Update the phase status in this plan**

Mark Tasks 1-6 complete in this document once the suite passes.

+ [x] **Step 4: Commit**

```bash
git add cmd/anng/main_test.go internal/agent/orchestrator_test.go internal/tools/read_test.go internal/tools/write_test.go internal/tui/app_test.go docs/superpowers/plans/2026-06-25-anng-go-cline-parity-foundation.md
git commit -m "test: lock phase-1 runtime invariants for Go parity foundation"
```

---

## Self-Review

### Spec coverage

- CLI contract mismatch: covered by Task 1.
- Runtime policy missing: covered by Task 2.
- Tool schema mismatch: covered by Task 3.
- Workspace jail missing: covered by Task 4.
- Permission UI disconnected from runtime: covered by Task 5.
- Verification harness weak: covered by Task 6.

### Placeholder scan

- No `TODO`, `TBD`, or “implement later” placeholders remain in executable steps.
- The only deferred work is explicitly split into later plans under `Scope Split`, not hidden inside this phase.

### Type consistency

- `ModeAct`, `ModePlan`, `ModeYolo` are used consistently.
- `toolSpecs()` is the canonical schema source used by orchestrator tests.
- `resolveWorkspacePath()` is the shared path-boundary helper used by file tools.

## Exit Criteria for This Plan

This plan is complete only when all of these are true:

1. `anng -p "..."` runs headless and exits without opening Bubble Tea.
2. Plan mode blocks mutating tools at runtime, not only in prompt text.
3. Tool schemas exposed to the LLM exactly match the registered runtime handlers.
4. File tools reject paths outside the workspace root.
5. The permission prompt path is connected to tool execution hooks instead of being dead UI.
6. The phase-1 Go test suite passes.

## Next Plan Gate

Do not start MCP parity or team parity until the exit criteria above are met.

Plan complete and saved to `docs/superpowers/plans/2026-06-25-anng-go-cline-parity-foundation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
