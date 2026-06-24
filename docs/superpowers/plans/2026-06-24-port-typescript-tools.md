# Port TypeScript Tools to Go Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Port all core tool handlers from TypeScript to Go in `anng-cli`, including state management, read, write, edit, AskUserQuestion, UpdatePlan, WebSearch, HttpRequest, and AnalyzeProject, and integrate them with the agent's orchestrator and TUI.

**Architecture:** We will implement tool handlers in the `internal/tools` package conforming to the `ToolHandler` function signature. We will introduce context keys to retrieve session state and project root, parse argument JSON values correctly, and register all default tools inside the `Orchestrator` in `internal/agent/orchestrator.go`.

**Tech Stack:** Go (Golang), Bubble Tea (TUI), SashaBaranov go-openai library, net/http.

---

### Task 1: Fix Orchestrator Argument Parsing & Context Support

**Files:**
- Modify: `internal/agent/orchestrator.go`
- Test: `internal/agent/orchestrator_test.go`

- [x] **Step 1: Write the failing test**
  Update `internal/agent/orchestrator_test.go` to verify tool argument parsing.

```go
package agent

import (
	"context"
	"encoding/json"
	"testing"
)

func TestOrchestratorArgumentParsing(t *testing.T) {
	orchestrator := NewOrchestrator("deepseek-v4", "mock-api-key")
	called := false
	orchestrator.RegisterTool("test_args", func(ctx context.Context, args map[string]interface{}) (string, error) {
		called = true
		if args["foo"] != "bar" {
			t.Errorf("Expected args['foo'] = 'bar', got %v", args["foo"])
		}
		return "ok", nil
	})

	// Manually invoke a test helper or trigger the code pathway that executes the tool call
	tc := struct {
		ID       string `json:"id"`
		Type     string `json:"type"`
		Function struct {
			Name      string `json:"name"`
			Arguments string `json:"arguments"`
		} `json:"function"`
	}{}
	tc.ID = "call-1"
	tc.Type = "function"
	tc.Function.Name = "test_args"
	tc.Function.Arguments = `{"foo": "bar"}`

	// Create completion request
	rawArgs, _ := json.Marshal(tc)
	_ = rawArgs

	// Let's run a handler check via Orchestrator implementation internals (we will export or run directly)
	handler, exists := orchestrator.ToolRegistry["test_args"]
	if !exists {
		t.Fatal("handler not found")
	}

	var parsedArgs map[string]interface{}
	err := json.Unmarshal([]byte(tc.Function.Arguments), &parsedArgs)
	if err != nil {
		t.Fatal(err)
	}

	res, err := handler(context.Background(), parsedArgs)
	if err != nil {
		t.Fatal(err)
	}
	if !called || res != "ok" {
		t.Error("Tool was not executed correctly")
	}
}
```

- [x] **Step 2: Run test to verify it fails**
  Run: `go test -v ./internal/agent/...`
  Expected: FAIL (argument test fails or compile errors due to missing package setup)

- [x] **Step 3: Write minimal implementation**
  Modify `internal/agent/orchestrator.go` to parse the arguments from json to `map[string]interface{}` and define Context Keys:

```go
package agent

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/sashabaranov/go-openai"
)

type contextKey string

const (
	SessionIDKey   contextKey = "session_id"
	ProjectRootKey contextKey = "project_root"
)

type RunResult struct {
	FinishReason string
	Turns        int
}

type Orchestrator struct {
	Model        string
	ApiKey       string
	BaseURL      string
	ToolRegistry map[string]func(ctx context.Context, args map[string]interface{}) (string, error)
}

func NewOrchestrator(model string, apiKey string) *Orchestrator {
	return &Orchestrator{
		Model:        model,
		ApiKey:       apiKey,
		ToolRegistry: make(map[string]func(ctx context.Context, args map[string]interface{}) (string, error)),
	}
}

func (o *Orchestrator) RegisterTool(name string, handler func(ctx context.Context, args map[string]interface{}) (string, error)) {
	o.ToolRegistry[name] = handler
}

func (o *Orchestrator) Run(ctx context.Context, prompt string) (*RunResult, error) {
	if o.ApiKey == "" || o.ApiKey == "mock-api-key" || o.ApiKey == "mock-key" {
		return &RunResult{FinishReason: "completed", Turns: 1}, nil
	}

	config := openai.DefaultConfig(o.ApiKey)
	if o.BaseURL != "" {
		config.BaseURL = o.BaseURL
	}
	client := openai.NewClientWithConfig(config)

	messages := []openai.ChatCompletionMessage{
		{
			Role:    openai.ChatMessageRoleUser,
			Content: prompt,
		},
	}

	turns := 0
	maxTurns := 10

	for turns < maxTurns {
		turns++
		resp, err := client.CreateChatCompletion(ctx, openai.ChatCompletionRequest{
			Model:    o.Model,
			Messages: messages,
		})
		if err != nil {
			return nil, fmt.Errorf("API call failed: %w", err)
		}

		if len(resp.Choices) == 0 {
			break
		}

		msg := resp.Choices[0].Message
		messages = append(messages, msg)

		if len(msg.ToolCalls) == 0 {
			break
		}

		for _, tc := range msg.ToolCalls {
			handler, exists := o.ToolRegistry[tc.Function.Name]
			var toolResult string
			var toolErr error
			if !exists {
				toolResult = fmt.Sprintf("Error: Tool %s not found", tc.Function.Name)
			} else {
				var args map[string]interface{}
				if err := json.Unmarshal([]byte(tc.Function.Arguments), &args); err != nil {
					toolResult = fmt.Sprintf("Error parsing arguments: %v", err)
				} else {
					toolResult, toolErr = handler(ctx, args)
					if toolErr != nil {
						toolResult = fmt.Sprintf("Error: %v", toolErr)
					}
				}
			}

			messages = append(messages, openai.ChatCompletionMessage{
				Role:       openai.ChatMessageRoleTool,
				Content:    toolResult,
				ToolCallID: tc.ID,
			})
		}
	}

	return &RunResult{FinishReason: "completed", Turns: turns}, nil
}
```

- [x] **Step 4: Run test to verify it passes**
  Run: `go test -v ./internal/agent/...`
  Expected: PASS

- [x] **Step 5: Commit**
  ```bash
  git add internal/agent/orchestrator.go internal/agent/orchestrator_test.go
  git commit -m "feat: parse tool arguments in orchestrator and declare context keys"
  ```

---

### Task 2: Session File State Management

**Files:**
- Create: `internal/tools/state.go`
- Create: `internal/tools/state_test.go`

- [x] **Step 1: Write the failing test**
  Create `internal/tools/state_test.go` to verify file state recording.

```go
package tools

import (
	"context"
	"testing"
	"anng-cli/internal/agent"
)

func TestFileStateTracking(t *testing.T) {
	ctx := context.WithValue(context.Background(), agent.SessionIDKey, "test-sess")
	RecordFileState(ctx, "/path/to/file", "hello world")

	state, ok := GetFileState(ctx, "/path/to/file")
	if !ok {
		t.Fatal("Expected state to exist")
	}
	if state.Content != "hello world" {
		t.Errorf("Expected content 'hello world', got %q", state.Content)
	}
}
```

- [x] **Step 2: Run test to verify it fails**
  Run: `go test -v ./internal/tools/...`
  Expected: FAIL (missing `RecordFileState` / `GetFileState` definitions)

- [x] **Step 3: Write minimal implementation**
  Create `internal/tools/state.go`:

```go
package tools

import (
	"context"
	"sync"
	"time"
	"anng-cli/internal/agent"
)

type FileState struct {
	FilePath  string
	Content   string
	Timestamp time.Time
}

var (
	stateMutex sync.Mutex
	fileStates = make(map[string]map[string]FileState)
)

func getSessionID(ctx context.Context) string {
	if val, ok := ctx.Value(agent.SessionIDKey).(string); ok {
		return val
	}
	return "default"
}

func RecordFileState(ctx context.Context, filePath string, content string) {
	stateMutex.Lock()
	defer stateMutex.Unlock()
	sessID := getSessionID(ctx)
	if _, ok := fileStates[sessID]; !ok {
		fileStates[sessID] = make(map[string]FileState)
	}
	fileStates[sessID][filePath] = FileState{
		FilePath:  filePath,
		Content:   content,
		Timestamp: time.Now(),
	}
}

func GetFileState(ctx context.Context, filePath string) (FileState, bool) {
	stateMutex.Lock()
	defer stateMutex.Unlock()
	sessID := getSessionID(ctx)
	sess, ok := fileStates[sessID]
	if !ok {
		return FileState{}, false
	}
	fs, ok := sess[filePath]
	return fs, ok
}
```

- [x] **Step 4: Run test to verify it passes**
  Run: `go test -v ./internal/tools/...`
  Expected: PASS

- [x] **Step 5: Commit**
  ```bash
  git add internal/tools/state.go internal/tools/state_test.go
  git commit -m "feat: implement session-based file state tracking"
  ```

---

### Task 3: Read Tool implementation

**Files:**
- Create: `internal/tools/read.go`
- Create: `internal/tools/read_test.go`

- [x] **Step 1: Write the failing test**
  Create `internal/tools/read_test.go` to verify file reading with path checks and ranges.

```go
package tools

import (
	"context"
	"os"
	"strings"
	"testing"
)

func TestReadTool(t *testing.T) {
	tempFile, err := os.CreateTemp("", "test_read.txt")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(tempFile.Name())

	content := "Line 1\nLine 2\nLine 3\nLine 4\n"
	if err := os.WriteFile(tempFile.Name(), []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	args := map[string]interface{}{
		"file_path":  tempFile.Name(),
		"start_line": float64(2),
		"end_line":   float64(3),
	}

	res, err := ReadTool(context.Background(), args)
	if err != nil {
		t.Fatalf("ReadTool failed: %v", err)
	}

	if !strings.Contains(res, "2: Line 2") || !strings.Contains(res, "3: Line 3") {
		t.Errorf("Expected lines 2 and 3 with line numbers, got: %q", res)
	}
}
```

- [x] **Step 2: Run test to verify it fails**
  Run: `go test -v ./internal/tools/...`
  Expected: FAIL (ReadTool not defined)

- [x] **Step 3: Write minimal implementation**
  Create `internal/tools/read.go`:

```go
package tools

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"anng-cli/internal/agent"
)

func ReadTool(ctx context.Context, args map[string]interface{}) (string, error) {
	filePathVal, ok := args["file_path"].(string)
	if !ok || filePathVal == "" {
		return "", errors.New("missing or invalid required argument 'file_path'")
	}

	projectRoot := "."
	if pr, ok := ctx.Value(agent.ProjectRootKey).(string); ok {
		projectRoot = pr
	}

	filePath := filePathVal
	if !filepath.IsAbs(filePath) {
		filePath = filepath.Join(projectRoot, filePath)
	}

	stat, err := os.Stat(filePath)
	if err != nil {
		return "", fmt.Errorf("file not found or unreadable: %w", err)
	}

	if stat.IsDir() {
		return "", errors.New("file_path points to a directory. Use bash for listing directories")
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		return "", fmt.Errorf("failed to read file: %w", err)
	}

	content := string(data)
	lines := strings.Split(content, "\n")
	
	startLine := 1
	if sl, ok := args["start_line"].(float64); ok {
		startLine = int(sl)
	}
	endLine := len(lines)
	if el, ok := args["end_line"].(float64); ok {
		endLine = int(el)
	}

	if startLine < 1 {
		startLine = 1
	}
	if endLine > len(lines) {
		endLine = len(lines)
	}
	if startLine > endLine {
		return "", errors.New("invalid start_line/end_line range")
	}

	var builder strings.Builder
	for i := startLine; i <= endLine; i++ {
		builder.WriteString(fmt.Sprintf("%d: %s\n", i, lines[i-1]))
	}

	// Track file state for write verification
	RecordFileState(ctx, filePath, content)

	return builder.String(), nil
}
```

- [x] **Step 4: Run test to verify it passes**
  Run: `go test -v ./internal/tools/...`
  Expected: PASS

- [x] **Step 5: Commit**
  ```bash
  git add internal/tools/read.go internal/tools/read_test.go
  git commit -m "feat: implement read tool with line numbering and range slices"
  ```

---

### Task 4: Write Tool implementation with session-state verification

**Files:**
- Create: `internal/tools/write.go`
- Create: `internal/tools/write_test.go`

- [x] **Step 1: Write the failing test**
  Create `internal/tools/write_test.go` verifying that writing fails if file wasn't read first, and succeeds if it was.

```go
package tools

import (
	"context"
	"os"
	"testing"
	"anng-cli/internal/agent"
)

func TestWriteToolStateVerification(t *testing.T) {
	tempFile, err := os.CreateTemp("", "test_write.txt")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(tempFile.Name())

	if err := os.WriteFile(tempFile.Name(), []byte("original content"), 0644); err != nil {
		t.Fatal(err)
	}

	ctx := context.WithValue(context.Background(), agent.SessionIDKey, "sess-write-test")

	// Try writing without reading first
	args := map[string]interface{}{
		"file_path": tempFile.Name(),
		"content":   "new content",
	}
	_, err = WriteTool(ctx, args)
	if err == nil || err.Error() != "Must read the full existing file before writing" {
		t.Errorf("Expected failure 'Must read the full existing file before writing', got: %v", err)
	}

	// Record read state manually
	RecordFileState(ctx, tempFile.Name(), "original content")

	// Try writing again
	res, err := WriteTool(ctx, args)
	if err != nil {
		t.Fatalf("Write failed: %v", err)
	}
	if res != "Updated file." {
		t.Errorf("Expected success output, got %q", res)
	}
}
```

- [x] **Step 2: Run test to verify it fails**
  Run: `go test -v ./internal/tools/...`
  Expected: FAIL (WriteTool not defined)

- [x] **Step 3: Write minimal implementation**
  Create `internal/tools/write.go`:

```go
package tools

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"anng-cli/internal/agent"
)

func WriteTool(ctx context.Context, args map[string]interface{}) (string, error) {
	filePathVal, ok := args["file_path"].(string)
	if !ok || filePathVal == "" {
		return "", errors.New("missing required argument 'file_path'")
	}
	contentVal, ok := args["content"].(string)
	if !ok {
		return "", errors.New("missing required argument 'content'")
	}

	projectRoot := "."
	if pr, ok := ctx.Value(agent.ProjectRootKey).(string); ok {
		projectRoot = pr
	}

	filePath := filePathVal
	if !filepath.IsAbs(filePath) {
		filePath = filepath.Join(projectRoot, filePath)
	}

	exists := true
	stat, err := os.Stat(filePath)
	if os.IsNotExist(err) {
		exists = false
	} else if err != nil {
		return "", err
	}

	if exists {
		if stat.IsDir() {
			return "", errors.New("file_path points to a directory")
		}
		if stat.Size() > 0 {
			state, recorded := GetFileState(ctx, filePath)
			if !recorded {
				return "", errors.New("Must read the full existing file before writing")
			}
			currentDiskBytes, err := os.ReadFile(filePath)
			if err != nil {
				return "", err
			}
			if string(currentDiskBytes) != state.Content {
				return "", errors.New("File has been modified since read. Read it again before writing")
			}
		}
	}

	// Create directory if not exists
	dir := filepath.Dir(filePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", fmt.Errorf("failed to create directory structure: %w", err)
	}

	if err := os.WriteFile(filePath, []byte(contentVal), 0644); err != nil {
		return "", fmt.Errorf("failed to write file: %w", err)
	}

	// Update state
	RecordFileState(ctx, filePath, contentVal)

	if exists {
		return "Updated file.", nil
	}
	return "Created file.", nil
}
```

- [x] **Step 4: Run test to verify it passes**
  Run: `go test -v ./internal/tools/...`
  Expected: PASS

- [x] **Step 5: Commit**
  ```bash
  git add internal/tools/write.go internal/tools/write_test.go
  git commit -m "feat: implement write tool with concurrent edit protections"
  ```

---

### Task 5: Edit Tool integration

**Files:**
- Create: `internal/tools/edit.go`
- Create: `internal/tools/edit_test.go`

- [x] **Step 1: Write the failing test**
  Create `internal/tools/edit_test.go` to verify standard edit handler wrap of `ReplaceFileContent`.

```go
package tools

import (
	"context"
	"os"
	"strings"
	"testing"
)

func TestEditTool(t *testing.T) {
	tempFile, err := os.CreateTemp("", "test_edit.txt")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(tempFile.Name())

	content := "line 1\nline 2\nline 3"
	if err := os.WriteFile(tempFile.Name(), []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	args := map[string]interface{}{
		"file_path":           tempFile.Name(),
		"target_content":      "line 2",
		"replacement_content": "line 2 modified",
		"start_line":          float64(2),
		"end_line":            float64(2),
	}

	res, err := EditTool(context.Background(), args)
	if err != nil {
		t.Fatalf("EditTool failed: %v", err)
	}

	if res != "Content replaced successfully" {
		t.Errorf("Expected success output, got %q", res)
	}

	updated, err := os.ReadFile(tempFile.Name())
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(updated), "line 2 modified") {
		t.Errorf("Expected updated content to contain modification, got %q", string(updated))
	}
}
```

- [x] **Step 2: Run test to verify it fails**
  Run: `go test -v ./internal/tools/...`
  Expected: FAIL (EditTool not defined)

- [x] **Step 3: Write minimal implementation**
  Create `internal/tools/edit.go`:

```go
package tools

import (
	"context"
	"errors"
	"path/filepath"

	"anng-cli/internal/agent"
)

func EditTool(ctx context.Context, args map[string]interface{}) (string, error) {
	filePathVal, ok := args["file_path"].(string)
	if !ok || filePathVal == "" {
		return "", errors.New("missing required argument 'file_path'")
	}
	targetVal, ok := args["target_content"].(string)
	if !ok {
		return "", errors.New("missing required argument 'target_content'")
	}
	replacementVal, ok := args["replacement_content"].(string)
	if !ok {
		return "", errors.New("missing required argument 'replacement_content'")
	}
	startLineVal, ok := args["start_line"].(float64)
	if !ok {
		return "", errors.New("missing required argument 'start_line'")
	}
	endLineVal, ok := args["end_line"].(float64)
	if !ok {
		return "", errors.New("missing required argument 'end_line'")
	}

	projectRoot := "."
	if pr, ok := ctx.Value(agent.ProjectRootKey).(string); ok {
		projectRoot = pr
	}

	filePath := filePathVal
	if !filepath.IsAbs(filePath) {
		filePath = filepath.Join(projectRoot, filePath)
	}

	err := ReplaceFileContent(filePath, targetVal, replacementVal, int(startLineVal), int(endLineVal))
	if err != nil {
		return "", err
	}

	return "Content replaced successfully", nil
}
```

- [x] **Step 4: Run test to verify it passes**
  Run: `go test -v ./internal/tools/...`
  Expected: PASS

- [x] **Step 5: Commit**
  ```bash
  git add internal/tools/edit.go internal/tools/edit_test.go
  git commit -m "feat: implement edit tool wrapping ReplaceFileContent"
  ```

---

### Task 6: AskUserQuestion & UpdatePlan Tools

**Files:**
- Create: `internal/tools/ask_user_question.go`
- Create: `internal/tools/ask_user_question_test.go`
- Create: `internal/tools/update_plan.go`
- Create: `internal/tools/update_plan_test.go`

- [x] **Step 1: Write the failing test**
  Create `internal/tools/ask_user_question_test.go` and `internal/tools/update_plan_test.go`.

```go
// internal/tools/ask_user_question_test.go
package tools

import (
	"context"
	"strings"
	"testing"
)

func TestAskUserQuestion(t *testing.T) {
	args := map[string]interface{}{
		"questions": []interface{}{
			map[string]interface{}{
				"question": "What flavor of tea?",
				"options": []interface{}{
					map[string]interface{}{"label": "Green"},
					map[string]interface{}{"label": "Black"},
				},
			},
		},
	}
	res, err := AskUserQuestionTool(context.Background(), args)
	if err != nil {
		t.Fatalf("Failed: %v", err)
	}
	if !strings.Contains(res, "Green") || !strings.Contains(res, "Black") {
		t.Errorf("Expected option labels in output, got: %q", res)
	}
}
```

```go
// internal/tools/update_plan_test.go
package tools

import (
	"context"
	"testing"
)

func TestUpdatePlan(t *testing.T) {
	args := map[string]interface{}{
		"plan":        "Step 1: Go coding",
		"explanation": "Starting code changes",
	}
	res, err := UpdatePlanTool(context.Background(), args)
	if err != nil {
		t.Fatalf("Failed: %v", err)
	}
	if res != "Plan updated." {
		t.Errorf("Expected 'Plan updated.', got %q", res)
	}
}
```

- [x] **Step 2: Run test to verify it fails**
  Run: `go test -v ./internal/tools/...`
  Expected: FAIL (missing AskUserQuestionTool and UpdatePlanTool)

- [x] **Step 3: Write minimal implementation**
  Create `internal/tools/ask_user_question.go`:

```go
package tools

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

func AskUserQuestionTool(ctx context.Context, args map[string]interface{}) (string, error) {
	rawQuestions, ok := args["questions"].([]interface{})
	if !ok || len(rawQuestions) == 0 {
		return "", errors.New("missing or empty required argument 'questions'")
	}

	var builder strings.Builder
	builder.WriteString("Waiting for user input.\n")

	for i, rawQ := range rawQuestions {
		qMap, ok := rawQ.(map[string]interface{})
		if !ok {
			continue
		}
		qText, _ := qMap["question"].(string)
		multiSelect, _ := qMap["multiSelect"].(bool)
		
		mode := "single-select"
		if multiSelect {
			mode = "multi-select"
		}

		builder.WriteString(fmt.Sprintf("\n%d. %s\n   Mode: %s\n", i+1, qText, mode))

		if opts, ok := qMap["options"].([]interface{}); ok {
			for _, optVal := range opts {
				if optMap, ok := optVal.(map[string]interface{}); ok {
					label, _ := optMap["label"].(string)
					desc, _ := optMap["description"].(string)
					if desc != "" {
						builder.WriteString(fmt.Sprintf("   - %s (%s)\n", label, desc))
					} else {
						builder.WriteString(fmt.Sprintf("   - %s\n", label))
					}
				}
			}
		}
		builder.WriteString("   - Other\n")
	}

	return builder.String(), nil
}
```

  Create `internal/tools/update_plan.go`:

```go
package tools

import (
	"context"
	"errors"
)

func UpdatePlanTool(ctx context.Context, args map[string]interface{}) (string, error) {
	plan, ok := args["plan"].(string)
	if !ok || plan == "" {
		return "", errors.New("missing required string 'plan'")
	}
	return "Plan updated.", nil
}
```

- [x] **Step 4: Run test to verify it passes**
  Run: `go test -v ./internal/tools/...`
  Expected: PASS

- [x] **Step 5: Commit**
  ```bash
  git add internal/tools/ask_user_question.go internal/tools/ask_user_question_test.go internal/tools/update_plan.go internal/tools/update_plan_test.go
  git commit -m "feat: implement AskUserQuestion and UpdatePlan tools"
  ```

---

### Task 7: WebSearch & HttpRequest Tools

**Files:**
- Create: `internal/tools/web_search_handler.go`
- Create: `internal/tools/web_search_handler_test.go`
- Create: `internal/tools/http_request.go`
- Create: `internal/tools/http_request_test.go`

- [x] **Step 1: Write the failing test**
  Create `internal/tools/web_search_handler_test.go` and `internal/tools/http_request_test.go`.

```go
// internal/tools/web_search_handler_test.go
package tools

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestWebSearchTool(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"result": "mock search result details"}`))
	}))
	defer ts.Close()

	// Inject the mock server endpoint URL into standard endpoint variable
	DefaultWebSearchAPIURL = ts.URL

	args := map[string]interface{}{
		"query": "test query string",
	}

	res, err := WebSearchTool(context.Background(), args)
	if err != nil {
		t.Fatalf("Search failed: %v", err)
	}

	if !strings.Contains(res, "mock search result details") {
		t.Errorf("Expected search results, got %q", res)
	}
}
```

```go
// internal/tools/http_request_test.go
package tools

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHttpRequestTool(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("mock response body content"))
	}))
	defer ts.Close()

	args := map[string]interface{}{
		"url":    ts.URL,
		"method": "GET",
	}

	res, err := HttpRequestTool(context.Background(), args)
	if err != nil {
		t.Fatalf("HttpRequest failed: %v", err)
	}

	if !strings.Contains(res, "mock response body content") {
		t.Errorf("Expected mock response body in output, got: %q", res)
	}
}
```

- [x] **Step 2: Run test to verify it fails**
  Run: `go test -v ./internal/tools/...`
  Expected: FAIL (missing definitions for WebSearchTool / HttpRequestTool)

- [x] **Step 3: Write minimal implementation**
  Create `internal/tools/web_search_handler.go`:

```go
package tools

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
)

var DefaultWebSearchAPIURL = "https://anng.vegamo.cn/api/plugin/web-search"

func WebSearchTool(ctx context.Context, args map[string]interface{}) (string, error) {
	query, ok := args["query"].(string)
	if !ok || query == "" {
		return "", errors.New("missing required query string")
	}

	reqPayload := map[string]string{
		"query": query,
	}
	bodyBytes, err := json.Marshal(reqPayload)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", DefaultWebSearchAPIURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	// Use mock or placeholder token for standalone client requests
	req.Header.Set("Token", "anng-cli-go-client")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("web search request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("web search returned non-200 status: %d", resp.StatusCode)
	}

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	var resultPayload struct {
		Result string `json:"result"`
	}
	if err := json.Unmarshal(respBytes, &resultPayload); err != nil {
		// Fallback to raw response if not standard JSON format
		return string(respBytes), nil
	}

	return resultPayload.Result, nil
}
```

  Create `internal/tools/http_request.go`:

```go
package tools

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
)

func HttpRequestTool(ctx context.Context, args map[string]interface{}) (string, error) {
	url, ok := args["url"].(string)
	if !ok || url == "" {
		return "", errors.New("missing required argument 'url'")
	}

	method := "GET"
	if m, ok := args["method"].(string); ok && m != "" {
		method = strings.ToUpper(m)
	}

	var bodyReader io.Reader
	if b, ok := args["body"].(string); ok && b != "" {
		bodyReader = bytes.NewReader([]byte(b))
	}

	req, err := http.NewRequestWithContext(ctx, method, url, bodyReader)
	if err != nil {
		return "", err
	}

	if headersMap, ok := args["headers"].(map[string]interface{}); ok {
		for k, v := range headersMap {
			if vs, ok := v.(string); ok {
				req.Header.Set(k, vs)
			}
		}
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("http request failed: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	bodyText := string(respBytes)
	maxChars := 20000
	if len(bodyText) > maxChars {
		bodyText = bodyText[:maxChars] + "\n\n...[TRUNCATED_DUE_TO_SIZE]..."
	}

	var headersBuilder strings.Builder
	for k, v := range resp.Header {
		headersBuilder.WriteString(fmt.Sprintf("%s: %s\n", k, strings.Join(v, ", ")))
	}

	output := fmt.Sprintf("Status: %s\nHeaders:\n%s\nBody:\n%s", resp.Status, headersBuilder.String(), bodyText)
	return output, nil
}
```

- [x] **Step 4: Run test to verify it passes**
  Run: `go test -v ./internal/tools/...`
  Expected: PASS

- [x] **Step 5: Commit**
  ```bash
  git add internal/tools/web_search_handler.go internal/tools/web_search_handler_test.go internal/tools/http_request.go internal/tools/http_request_test.go
  git commit -m "feat: implement WebSearch and HttpRequest tools in Go"
  ```

---

### Task 8: AnalyzeProject Tool

**Files:**
- Create: `internal/tools/analyze_project.go`
- Create: `internal/tools/analyze_project_test.go`

- [x] **Step 1: Write the failing test**
  Create `internal/tools/analyze_project_test.go` verifying output structure.

```go
package tools

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"anng-cli/internal/agent"
)

func TestAnalyzeProjectTool(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "test_project")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	// Create src directory
	srcDir := filepath.Join(tempDir, "src")
	if err := os.MkdirAll(srcDir, 0755); err != nil {
		t.Fatal(err)
	}

	// Create sample go file
	sampleGo := filepath.Join(srcDir, "main.go")
	content := `package main

type MyStruct struct {}
func MyFunc() {}
`
	if err := os.WriteFile(sampleGo, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	ctx := context.WithValue(context.Background(), agent.ProjectRootKey, tempDir)

	args := map[string]interface{}{
		"depth": float64(3),
	}

	res, err := AnalyzeProjectTool(ctx, args)
	if err != nil {
		t.Fatalf("Analyze failed: %v", err)
	}

	if !strings.Contains(res, "MyStruct") || !strings.Contains(res, "MyFunc") {
		t.Errorf("Expected semantic map exports in output, got: %q", res)
	}
}
```

- [x] **Step 2: Run test to verify it fails**
  Run: `go test -v ./internal/tools/...`
  Expected: FAIL (missing AnalyzeProjectTool)

- [x] **Step 3: Write minimal implementation**
  Create `internal/tools/analyze_project.go`:

```go
package tools

import (
	"bufio"
	"context"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"

	"anng-cli/internal/agent"
)

func AnalyzeProjectTool(ctx context.Context, args map[string]interface{}) (string, error) {
	projectRoot := "."
	if pr, ok := ctx.Value(agent.ProjectRootKey).(string); ok {
		projectRoot = pr
	}

	depth := 3
	if d, ok := args["depth"].(float64); ok {
		depth = int(d)
	}

	var treeOutput string
	cmd := exec.Command("find", projectRoot, "-maxdepth", fmt.Sprintf("%d", depth), "-not", "-path", "*/node_modules/*", "-not", "-path", "*/.git/*", "-not", "-path", "*/dist/*")
	out, err := cmd.CombinedOutput()
	if err == nil {
		treeOutput = string(out)
	} else {
		treeOutput = fmt.Sprintf("Failed to run find: %v", err)
	}

	// Try reading go.mod file if present
	goModBytes, _ := os.ReadFile(filepath.Join(projectRoot, "go.mod"))
	goModContent := string(goModBytes)

	// Scan package structures and build semantic map (functions and structs)
	var semanticMap strings.Builder
	semanticMap.WriteString("Semantic Export Map (Structs, Interfaces, Funcs):\n")

	typeReg := regexp.MustCompile(`^type\s+([A-Z][a-zA-Z0-9_]*)\s+(struct|interface)`)
	funcReg := regexp.MustCompile(`^func\s+(?:\([^)]+\)\s+)?([A-Z][a-zA-Z0-9_]*)\(`)

	filepath.WalkDir(projectRoot, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			if d.Name() == "node_modules" || d.Name() == ".git" || d.Name() == "dist" {
				return filepath.SkipDir
			}
			return nil
		}
		if filepath.Ext(path) == ".go" {
			file, err := os.Open(path)
			if err != nil {
				return nil
			}
			defer file.Close()

			var symbols []string
			scanner := bufio.NewScanner(file)
			for scanner.Scan() {
				line := strings.TrimSpace(scanner.Text())
				if matches := typeReg.FindStringSubmatch(line); len(matches) > 1 {
					symbols = append(symbols, matches[1])
				} else if matches := funcReg.FindStringSubmatch(line); len(matches) > 1 {
					symbols = append(symbols, matches[1])
				}
			}

			if len(symbols) > 0 {
				rel, _ := filepath.Rel(projectRoot, path)
				semanticMap.WriteString(fmt.Sprintf("- %s: %s\n", rel, strings.Join(symbols, ", ")))
			}
		}
		return nil
	})

	output := fmt.Sprintf("Directory Tree:\n%s\n\nGo.mod details:\n%s\n\n%s", treeOutput, goModContent, semanticMap.String())
	return output, nil
}
```

- [x] **Step 4: Run test to verify it passes**
  Run: `go test -v ./internal/tools/...`
  Expected: PASS

- [x] **Step 5: Commit**
  ```bash
  git add internal/tools/analyze_project.go internal/tools/analyze_project_test.go
  git commit -m "feat: implement AnalyzeProject tool for structural and semantic workspace maps"
  ```

---

### Task 9: Register Tools in Orchestrator & App Startup

**Files:**
- Modify: `internal/agent/orchestrator.go`
- Modify: `internal/tui/app.go`
- Modify: `internal/agent/headless.go`

- [x] **Step 1: Write the failing test**
  Update `internal/agent/orchestrator_test.go` to verify that standard tools are auto-registered.

```go
package agent

import (
	"testing"
)

func TestStandardToolsRegistration(t *testing.T) {
	orchestrator := NewOrchestrator("deepseek-v4", "mock-api-key")
	standardTools := []string{
		"read", "write", "edit", "AskUserQuestion", "UpdatePlan", "WebSearch", "HttpRequest", "AnalyzeProject",
	}

	for _, tool := range standardTools {
		if _, exists := orchestrator.ToolRegistry[tool]; !exists {
			t.Errorf("Expected standard tool %q to be registered, but was not", tool)
		}
	}
}
```

- [x] **Step 2: Run test to verify it fails**
  Run: `go test -v ./internal/agent/...`
  Expected: FAIL (tools not registered automatically yet)

- [x] **Step 3: Write minimal implementation**
  Modify `internal/agent/orchestrator.go` to import and register the tools:

```go
package agent

import (
	"context"
	"encoding/json"
	"fmt"

	"anng-cli/internal/tools"
	"github.com/sashabaranov/go-openai"
)

// Add registration helper inside NewOrchestrator
func NewOrchestrator(model string, apiKey string) *Orchestrator {
	o := &Orchestrator{
		Model:        model,
		ApiKey:       apiKey,
		ToolRegistry: make(map[string]func(ctx context.Context, args map[string]interface{}) (string, error)),
	}
	
	o.RegisterTool("bash", func(ctx context.Context, args map[string]interface{}) (string, error) {
		cmd, _ := args["command"].(string)
		cwd, _ := args["cwd"].(string)
		return tools.ExecuteBashCommand(ctx, cmd, cwd)
	})
	o.RegisterTool("read", tools.ReadTool)
	o.RegisterTool("write", tools.WriteTool)
	o.RegisterTool("edit", tools.EditTool)
	o.RegisterTool("AskUserQuestion", tools.AskUserQuestionTool)
	o.RegisterTool("UpdatePlan", tools.UpdatePlanTool)
	o.RegisterTool("WebSearch", tools.WebSearchTool)
	o.RegisterTool("HttpRequest", tools.HttpRequestTool)
	o.RegisterTool("AnalyzeProject", tools.AnalyzeProjectTool)

	return o
}
```

  Modify `internal/tui/app.go` to inject context variables (`ProjectRootKey` and `SessionIDKey`) during orchestrator runs:

```go
					return m, func() tea.Msg {
						orch := agent.NewOrchestrator(m.Config.Model, m.Config.ApiKey)
						ctx := context.WithValue(context.Background(), agent.ProjectRootKey, m.Config.ProjectRoot)
						ctx = context.WithValue(ctx, agent.SessionIDKey, "session-tui")
						res, err := orch.Run(ctx, text)
						return AgentFinishedMsg{Result: res, Err: err}
					}
```

  Modify `internal/agent/headless.go` to inject similar contexts:

```go
	ctx = context.WithValue(ctx, ProjectRootKey, ".")
	ctx = context.WithValue(ctx, SessionIDKey, "session-headless")
	res, err := orch.Run(ctx, prompt)
```

- [x] **Step 4: Run test to verify it passes**
  Run: `go test -v ./...`
  Expected: PASS

- [x] **Step 5: Commit**
  ```bash
  git add internal/agent/orchestrator.go internal/tui/app.go internal/agent/headless.go
  git commit -m "feat: register all ported TS tools in Go Orchestrator and TUI context"
  ```
