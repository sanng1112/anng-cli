# ANNG Go Refactor Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild and align ANNG Go with ANNG TS capabilities by implementing a background task manager, real MCP server client, AST-based project parser, and auto-corrective debugging loops.

**Architecture:** We will create a thread-safe `TaskManager` in `internal/tools` to manage async shell processes, extend `internal/mcp` to parse standard configurations and handle dynamic JSON-RPC communication, refactor the codebase analyzer using Go's native AST packages, and inject compiler-error recovery checkpoints directly into the `Orchestrator` conversation turn loop.

**Tech Stack:** Go (Golang), `go/parser`, `go/ast`, `github.com/creack/pty`, `net/http`, Bubble Tea.

---

### Task 1: Background Task Manager

**Files:**
- Create: `internal/tools/task_manager.go`
- Create: `internal/tools/task_manager_test.go`
- Modify: `internal/tui/app.go:120-135`

- [ ] **Step 1: Write the failing test**

Tạo tệp `internal/tools/task_manager_test.go` để kiểm thử tính năng quản lý tiến trình chạy ngầm:

```go
package tools

import (
	"context"
	"strings"
	"testing"
	"time"
)

func TestTaskManagerLifecycle(t *testing.T) {
	tm := NewTaskManager()

	// Khởi động một task chạy ngầm đơn giản
	err := tm.StartTask("task-1", "sleep 10", "/tmp")
	if err != nil {
		t.Fatalf("Failed to start task: %v", err)
	}

	task, exists := tm.GetTask("task-1")
	if !exists {
		t.Fatal("Task should exist in registry")
	}
	if !task.Running {
		t.Error("Task should be marked as running")
	}

	// Đọc danh sách các task
	list := tm.ListTasks()
	if len(list) != 1 || list[0].ID != "task-1" {
		t.Errorf("Expected 1 task in list, got: %v", list)
	}

	// Dừng/Kill task
	err = tm.KillTask("task-1")
	if err != nil {
		t.Fatalf("Failed to kill task: %v", err)
	}

	time.Sleep(100 * time.Millisecond) // Đợi tiến trình dừng hẳn
	
	task, _ = tm.GetTask("task-1")
	if task.Running {
		t.Error("Task should not be running after KillTask")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Chạy câu lệnh kiểm thử:
Run: `conda run -n go_env env CGO_ENABLED=0 go test -v anng-cli/internal/tools -run TestTaskManagerLifecycle`
Expected: FAIL với lỗi compile "undefined: NewTaskManager"

- [ ] **Step 3: Write minimal implementation**

Tạo tệp `internal/tools/task_manager.go` để hiện thực hóa `TaskManager`:

```go
package tools

import (
	"fmt"
	"os/exec"
	"sync"
)

type BackgroundTask struct {
	ID      string    `json:"id"`
	Command string    `json:"command"`
	Cmd     *exec.Cmd `json:"-"`
	Running bool      `json:"running"`
}

type TaskManager struct {
	sync.Mutex
	tasks map[string]*BackgroundTask
}

var globalTaskManager *TaskManager
var once sync.Once

func GetTaskManager() *TaskManager {
	once.Do(func() {
		globalTaskManager = NewTaskManager()
	})
	return globalTaskManager
}

func NewTaskManager() *TaskManager {
	return &TaskManager{
		tasks: make(map[string]*BackgroundTask),
	}
}

func (tm *TaskManager) StartTask(id string, cmdStr string, projectRoot string) error {
	tm.Lock()
	defer tm.Unlock()

	cmd := exec.Command("bash", "-c", cmdStr)
	cmd.Dir = projectRoot

	task := &BackgroundTask{
		ID:      id,
		Command: cmdStr,
		Cmd:     cmd,
		Running: true,
	}

	err := cmd.Start()
	if err != nil {
		task.Running = false
		return err
	}

	tm.tasks[id] = task

	// Giám sát tiến trình tự động kết thúc ngầm
	go func() {
		_ = cmd.Wait()
		tm.Lock()
		defer tm.Unlock()
		task.Running = false
	}()

	return nil
}

func (tm *TaskManager) KillTask(id string) error {
	tm.Lock()
	defer tm.Unlock()

	task, exists := tm.tasks[id]
	if !exists {
		return fmt.Errorf("task %s not found", id)
	}

	if task.Cmd != nil && task.Cmd.Process != nil && task.Running {
		err := task.Cmd.Process.Kill()
		if err != nil {
			return err
		}
	}
	task.Running = false
	return nil
}

func (tm *TaskManager) GetTask(id string) (*BackgroundTask, bool) {
	tm.Lock()
	defer tm.Unlock()
	task, exists := tm.tasks[id]
	return task, exists
}

func (tm *TaskManager) ListTasks() []*BackgroundTask {
	tm.Lock()
	defer tm.Unlock()
	var list []*BackgroundTask
	for _, t := range tm.tasks {
		list = append(list, t)
	}
	return list
}
```

- [ ] **Step 4: Run test to verify it passes**

Chạy lại câu lệnh kiểm thử:
Run: `conda run -n go_env env CGO_ENABLED=0 go test -v anng-cli/internal/tools -run TestTaskManagerLifecycle`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/tools/task_manager.go internal/tools/task_manager_test.go
git commit -m "feat: implement background task manager for async process lifecycle tracking"
```

---

### Task 2: Real MCP Client Integration

**Files:**
- Modify: `internal/mcp/client.go`
- Create: `internal/mcp/client_test.go`
- Create: `internal/mcp/config.go`

- [ ] **Step 1: Write the failing test**

Tạo tệp `internal/mcp/client_test.go` để kiểm thử nạp cấu hình MCP và kết nối với MCP server qua stdin/stdout:

```go
package mcp

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestMCPConfigParsingAndClientInit(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "mcp_test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	configPath := filepath.Join(tempDir, "mcp-servers.json")
	configData := `{
		"mcpServers": {
			"echo-server": {
				"command": "node",
				"args": ["-e", "const readline = require('readline'); const rl = readline.createInterface({input: process.stdin, output: process.stdout}); rl.on('line', (line) => { console.log(line); });"]
			}
		}
	}`
	_ = os.WriteFile(configPath, []byte(configData), 0644)

	cfg, err := LoadMCPConfig(configPath)
	if err != nil {
		t.Fatalf("Failed to load MCP config: %v", err)
	}

	server, exists := cfg.Servers["echo-server"]
	if !exists {
		t.Fatal("echo-server config should be parsed")
	}

	// Khởi chạy tiến trình MCP Server thực tế qua stdin/stdout
	client, err := StartMCPServer(context.Background(), server.Command, server.Args)
	if err != nil {
		t.Fatalf("Failed to start MCP server: %v", err)
	}
	defer client.Close()

	if client.Cmd == nil {
		t.Error("Client command process should not be nil")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Chạy câu lệnh kiểm thử:
Run: `conda run -n go_env env CGO_ENABLED=0 go test -v anng-cli/internal/mcp`
Expected: FAIL với lỗi compile "undefined: LoadMCPConfig"

- [ ] **Step 3: Write minimal implementation**

Tạo tệp `internal/mcp/config.go` để phân tích file cấu hình `mcp-servers.json`:

```go
package mcp

import (
	"encoding/json"
	"os"
)

type MCPServerConfig struct {
	Command string            `json:"command"`
	Args    []string          `json:"args"`
	Env     map[string]string `json:"env,omitempty"`
}

type MCPConfig struct {
	Servers map[string]MCPServerConfig `json:"mcpServers"`
}

func LoadMCPConfig(path string) (*MCPConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var cfg MCPConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}
```

Cập nhật `internal/mcp/client.go` bổ sung hàm khởi chạy server thực tế và quản lý vòng đời:

```go
package mcp

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os/exec"
)

type MCPClient struct {
	reader *bufio.Reader
	writer io.Writer
	Cmd    *exec.Cmd
}

type InitializeResult struct {
	ProtocolVersion string `json:"protocolVersion"`
}

type JSONRPCResponse struct {
	JSONRPC string           `json:"jsonrpc"`
	Result  InitializeResult `json:"result"`
	Error   interface{}      `json:"error,omitempty"`
	ID      int              `json:"id"`
}

func NewMCPClient(r io.Reader, w io.Writer) *MCPClient {
	return &MCPClient{
		reader: bufio.NewReader(r),
		writer: w,
	}
}

func StartMCPServer(ctx context.Context, command string, args []string) (*MCPClient, error) {
	cmd := exec.CommandContext(ctx, command, args...)
	
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}

	if err := cmd.Start(); err != nil {
		return nil, err
	}

	client := &MCPClient{
		reader: bufio.NewReader(stdout),
		writer: stdin,
		Cmd:    cmd,
	}

	return client, nil
}

func (c *MCPClient) Initialize(ctx context.Context) (*InitializeResult, error) {
	req := `{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}` + "\n"
	if _, err := io.WriteString(c.writer, req); err != nil {
		return nil, err
	}

	lineChan := make(chan string, 1)
	errChan := make(chan error, 1)

	go func() {
		line, err := c.reader.ReadString('\n')
		if err != nil {
			errChan <- err
		} else {
			lineChan <- line
		}
	}()

	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case err := <-errChan:
		return nil, err
	case line := <-lineChan:
		var resp JSONRPCResponse
		if err := json.Unmarshal([]byte(line), &resp); err != nil {
			return nil, err
		}
		if resp.Error != nil {
			return nil, fmt.Errorf("JSON-RPC error returned: %v", resp.Error)
		}
		return &resp.Result, nil
	}
}

func (c *MCPClient) Close() {
	if c.Cmd != nil && c.Cmd.Process != nil {
		_ = c.Cmd.Process.Kill()
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Chạy lại câu lệnh kiểm thử:
Run: `conda run -n go_env env CGO_ENABLED=0 go test -v anng-cli/internal/mcp`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/mcp/client.go internal/mcp/client_test.go internal/mcp/config.go
git commit -m "feat: parse mcp config and support starting real mcp JSON-RPC servers"
```

---

### Task 3: AST-Based Codebase Analyzer

**Files:**
- Modify: `internal/tools/analyze_project.go`
- Modify: `internal/tools/analyze_project_test.go`

- [ ] **Step 1: Write the failing test**

Cập nhật `internal/tools/analyze_project_test.go` để mô phỏng một interface và struct cụ thể, xác minh bộ phân tích AST nhận dạng chính xác và ghi chú rõ ràng các phương thức đi kèm:

```go
package tools

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	
	"anng-cli/internal/contextkeys"
)

func TestASTAnalyzeProjectTool(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "test_ast_project")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	srcDir := filepath.Join(tempDir, "src")
	_ = os.MkdirAll(srcDir, 0755)

	sampleGo := filepath.Join(srcDir, "service.go")
	content := `package src

type Runner interface {
	Run(ctx context.Context) error
}

type MyRunner struct {
	Name string
}

func (r *MyRunner) Run(ctx context.Context) error {
	return nil
}
`
	_ = os.WriteFile(sampleGo, []byte(content), 0644)

	ctx := context.WithValue(context.Background(), contextkeys.ProjectRootKey, tempDir)
	args := map[string]interface{}{"depth": float64(3)}

	res, err := AnalyzeProjectTool(ctx, args)
	if err != nil {
		t.Fatalf("AST analyze failed: %v", err)
	}

	if !strings.Contains(res, "Runner [Interface]") {
		t.Errorf("Expected interface details in output, got: %q", res)
	}
	if !strings.Contains(res, "MyRunner [Struct]") {
		t.Errorf("Expected struct details in output, got: %q", res)
	}
	if !strings.Contains(res, "Method: Run") {
		t.Errorf("Expected struct method details in output, got: %q", res)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Chạy câu lệnh kiểm thử:
Run: `conda run -n go_env env CGO_ENABLED=0 go test -v anng-cli/internal/tools -run TestASTAnalyzeProjectTool`
Expected: FAIL do output chưa định dạng `[Interface]`, `[Struct]` hoặc `Method: Run` từ code regex cũ.

- [ ] **Step 3: Write minimal implementation**

Sửa `internal/tools/analyze_project.go` để chuyển từ bộ lọc Regex sang phân tích cú pháp cây AST của Go thông qua gói `go/parser` và `go/ast`:

```go
package tools

import (
	"context"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"anng-cli/internal/contextkeys"
)

func AnalyzeProjectTool(ctx context.Context, args map[string]interface{}) (string, error) {
	projectRoot := "."
	if pr, ok := ctx.Value(contextkeys.ProjectRootKey).(string); ok {
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

	goModBytes, _ := os.ReadFile(filepath.Join(projectRoot, "go.mod"))
	goModContent := string(goModBytes)

	var semanticMap strings.Builder
	semanticMap.WriteString("AST Semantic Export Map (Structs, Interfaces, Funcs, Methods):\n")

	fset := token.NewFileSet()
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
		if filepath.Ext(path) == ".go" && !strings.HasSuffix(path, "_test.go") {
			fileAST, err := parser.ParseFile(fset, path, nil, parser.ParseComments)
			if err != nil {
				return nil
			}

			var symbols []string
			for _, decl := range fileAST.Decls {
				switch gd := decl.(type) {
				case *ast.GenDecl:
					if gd.Tok == token.TYPE {
						for _, spec := range gd.Specs {
							ts, ok := spec.(*ast.TypeSpec)
							if !ok {
								continue
							}
							switch ts.Type.(type) {
							case *ast.StructType:
								symbols = append(symbols, fmt.Sprintf("%s [Struct]", ts.Name.Name))
							case *ast.InterfaceType:
								symbols = append(symbols, fmt.Sprintf("%s [Interface]", ts.Name.Name))
							}
						}
					}
				case *ast.FuncDecl:
					symbolName := gd.Name.Name
					if gd.Recv != nil && len(gd.Recv.List) > 0 {
						// Lấy tên struct/receiver type
						var receiverName string
						switch rt := gd.Recv.List[0].Type.(type) {
						case *ast.Ident:
							receiverName = rt.Name
						case *ast.StarExpr:
							if ident, ok := rt.X.(*ast.Ident); ok {
								receiverName = ident.Name
							}
						}
						if receiverName != "" {
							symbolName = fmt.Sprintf("%s.Method: %s", receiverName, gd.Name.Name)
						}
					} else {
						symbolName = fmt.Sprintf("Func: %s", symbolName)
					}
					symbols = append(symbols, symbolName)
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

- [ ] **Step 4: Run test to verify it passes**

Chạy lại câu lệnh kiểm thử:
Run: `conda run -n go_env env CGO_ENABLED=0 go test -v anng-cli/internal/tools -run TestASTAnalyzeProjectTool`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/tools/analyze_project.go internal/tools/analyze_project_test.go
git commit -m "feat: migrate AnalyzeProject tool to AST-based syntax tree parsing"
```

---

### Task 4: Auto-Corrective Compile Loop

**Files:**
- Modify: `internal/agent/orchestrator.go:130-170`
- Modify: `internal/agent/orchestrator_test.go:30-80`

- [ ] **Step 1: Write the failing test**

Cập nhật `internal/agent/orchestrator_test.go` để giả lập tình huống biên dịch lỗi khi chạy lệnh bash, xác minh Orchestrator tự động đưa phản hồi lỗi ngược vào ngữ cảnh hội thoại để LLM tiếp tục tìm phương án khắc phục thay vì thoát lập tức:

```go
package agent

import (
	"context"
	"strings"
	"testing"
)

func TestAutoCorrectiveLoopOnCompileError(t *testing.T) {
	orchestrator := NewOrchestrator("deepseek-chat", "mock-key")
	orchestrator.BaseURL = "mock-url"

	// Đăng ký một tool bash mô phỏng trả về lỗi biên dịch ở lượt 1, thành công lượt 2
	lượtChạy := 0
	orchestrator.RegisterTool("bash", func(ctx context.Context, args map[string]interface{}) (string, error) {
		lượtChạy++
		if lượtChạy == 1 {
			return "exit status 1: main.go:10: syntax error: unexpected semicolon", nil
		}
		return "build success", nil
	})

	// Do đây là mock test, chúng ta kiểm chứng logic phân tích lỗi compiler
	shouldCorrect := orchestrator.checkForCompilerErrors("exit status 1: main.go:10: syntax error: unexpected semicolon")
	if !shouldCorrect {
		t.Error("Expected checkForCompilerErrors to return true for syntax error stack trace")
	}

	shouldNotCorrect := orchestrator.checkForCompilerErrors("hello world no error")
	if shouldNotCorrect {
		t.Error("Expected checkForCompilerErrors to return false for regular output")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Chạy câu lệnh kiểm thử:
Run: `conda run -n go_env env CGO_ENABLED=0 go test -v anng-cli/internal/agent -run TestAutoCorrectiveLoopOnCompileError`
Expected: FAIL với lỗi compile "undefined: (*Orchestrator).checkForCompilerErrors"

- [ ] **Step 3: Write minimal implementation**

Sửa đổi `internal/agent/orchestrator.go` để bổ sung logic phát hiện lỗi biên dịch (`checkForCompilerErrors`) và tự động chèn tin nhắn chỉnh sửa vào luồng tương tác của Agent (tối đa 3 lượt sửa lỗi biên dịch trước khi thông báo thất bại hoàn toàn):

```go
// Chèn phương thức hỗ trợ checkForCompilerErrors vào internal/agent/orchestrator.go

func (o *Orchestrator) checkForCompilerErrors(output string) bool {
	errorKeywords := []string{
		"syntax error:",
		"undefined:",
		"type mismatch",
		"exit status 1",
		"build failed",
		"compiler error",
		"not used",
	}
	for _, kw := range errorKeywords {
		if strings.Contains(strings.ToLower(output), kw) {
			return true
		}
	}
	return false
}
```

Cập nhật hàm `Orchestrator.Run` trong internal/agent/orchestrator.go để kiểm tra đầu ra từ `bash` tool. Nếu gặp lỗi compiler, tự động đính kèm thông báo lỗi và yêu cầu mô hình chỉnh sửa mã nguồn:

```go
// Trong vòng lặp thực thi tool calls của Orchestrator.Run:
// Nếu toolName == "bash" và toolResult chứa lỗi compiler:
if tc.Function.Name == "bash" && o.checkForCompilerErrors(toolResult) && turns < maxTurns {
    // Chèn chỉ dẫn sửa đổi tự động vào tin nhắn
    toolResult = fmt.Sprintf("%s\n\n[SYSTEM CHECKPOINT]: The execution resulted in a compiler error. Please analyze the error trace, make the necessary file corrections using write/edit, and run the verification command again.", toolResult)
}
```

- [ ] **Step 4: Run test to verify it passes**

Chạy lại câu lệnh kiểm thử:
Run: `conda run -n go_env env CGO_ENABLED=0 go test -v anng-cli/internal/agent -run TestAutoCorrectiveLoopOnCompileError`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/agent/orchestrator.go internal/agent/orchestrator_test.go
git commit -m "feat: add automatic compiler error corrective loops inside agent orchestrator"
```
