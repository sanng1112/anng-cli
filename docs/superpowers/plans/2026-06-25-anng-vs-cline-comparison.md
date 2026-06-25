# ANNG CLI vs Cline — So sánh chi tiết hệ thống Agent Coding

> **Cho agentic workers:** Plan này phân tích và so sánh toàn diện giữa ANNG CLI và Cline về CLI capabilities, systems architecture, harness engineering, và các hỗ trợ liên quan.

**Mục tiêu:** Đánh giá chi tiết 2 hệ thống AI coding agent: ANNG CLI (Go) và Cline (TypeScript/Node.js), chỉ ra điểm mạnh/yếu của từng bên và cơ hội cải tiến.

**Phạm vi:** CLI, Systems, Harness Engineering, MCP, Skills, Tooling, Testing, Routing, dmux Workflow Integration.

**dmux context:** Tài liệu này tham chiếu đến [dmux](https://github.com/standardagents/dmux) — một công cụ orchestration tmux-based cho AI agent sessions — như một lớp bổ sung để bù đắp điểm yếu về parallel orchestration của cả hai hệ thống.

---

## Mục lục

1. [Tổng quan kiến trúc](#1-tổng-quan-kiến-trúc)
2. [CLI Capabilities](#2-cli-capabilities)
3. [Harness Engineering](#3-harness-engineering)
4. [Systems Architecture](#4-systems-architecture)
5. [MCP Protocol](#5-mcp-protocol)
6. [Skills System](#6-skills-system)
7. [Testing & Quality](#7-testing--quality)
8. [Routing](#8-routing)
9. [dmux Workflow Integration](#9-dmux-workflow-integration)
10. [Điểm mạnh/yếu](#10-điểm-mạnhyếu)
11. [Cơ hội cải tiến cho ANNG CLI](#11-cơ-hội-cải-tiến-cho-anng-cli)
12. [Recommendation Matrix](#12-recommendation-matrix)
13. [Kết luận](#13-kết-luận)

---
## 1. Tổng quan kiến trúc

| Tiêu chí | ANNG CLI | Cline |
|---|---|---|
| **Ngôn ngữ** | Go 1.24 | TypeScript/Node.js |
| **Giao diện** | TUI (Bubble Tea) + Headless CLI | VS Code Extension + Terminal |
| **Entry point** | `cmd/anng/main.go` | VS Code extension host |
| **API Client** | `github.com/sashabaranov/go-openai` | OpenAI SDK + Anthropic SDK + custom |
| **Providers** | OpenAI, DeepSeek, Anthropic, Google | OpenAI, Anthropic, Google, AWS Bedrock, Azure, Ollama |
| **Tool system** | `map[string]func(ctx, args)` | Structured tool definitions |
| **Agent loop** | Synchronous turn-based | Async event-driven |
| **Session** | JSONL files | In-memory + file persistence |
| **MCP** | Stdio transport, JSON-RPC 2.0 | Stdio + SSE transport, full MCP spec |
| **Skills** | YAML frontmatter SKILL.md | Markdown skill files |
| **Binary size** | ~12MB (single static binary) | ~50-100MB (Node.js + deps) |
| **Startup time** | <100ms (compiled Go) | ~500ms-2s (Node.js init) |
| **Memory idle** | ~10-15MB RSS | ~50-80MB RSS |
| **License** | MIT | Apache 2.0 |
| **Design philosophy** | Minimal, fast, standalone terminal tool | Maximal, integrated IDE experience |
| **Extensibility** | Go plugins + MCP | VS Code extensions + MCP + skills |
| **CI/CD friendly** | ✅ Binary, no runtime deps | ⚠️ Needs Node.js runtime |

### Design Philosophy Deep-Dive

**ANNG CLI — "Unix Philosophy" Approach:**
```
ANNG CLI = One tool, one job well done
├── Do one thing: AI coding assistant in terminal
├── Do it fast: Compiled Go, no JIT, no GC pauses
├── Do it standalone: Single binary, zero dependencies
└── Do it transparently: JSONL sessions, visible config
```

**Cline — "Integrated Platform" Approach:**
```
Cline = Everything in one ecosystem
├── Deep IDE integration: File explorer, editor, git, terminal
├── Extensible by design: 200+ skills, MCP, custom tools
├── Multi-agent architecture: spawn_agent, team_* tools
└── Rich feedback loops: Verification, testing, browser QA
```

---
## 2. CLI Capabilities

### ANNG CLI (`cmd/anng/main.go`)

#### Flags chi tiết

| Flag | Alias | Mô tả | Mặc định |
|---|---|---|---|
| `--prompt` | `-p` | Prompt trực tiếp (headless mode) | `""` |
| `--yolo` | `-y` | Auto-approve tất cả mutations (không confirm) | `false` |
| `--plan` | — | Plan-only mode (block mutations) | `false` |
| `--json` | — | JSON output (cho CI/CD pipelines) | `false` |
| `--verbose` | `-v` | Detailed logging | `false` |
| `--max-turns` | — | Số turn tối đa | `20` |
| `--help` | `-h` | Help text | — |
| `--version` | — | Version info | — |

#### Run modes

| Mode | Command | Use Case |
|---|---|---|
| **TUI** (default) | `anng` | Interactive coding session |
| **Headless** | `anng -p "prompt"` | Quick tasks, scripting |
| **CI/CD** | `anng -p "prompt" --json --yolo` | Automated pipelines |
| **Plan** | `anng -p "plan" --plan` | Research, architecture design |
| **Piped** | `echo "prompt" \| anng` | Unix pipe integration |

#### Environment Variables

| Variable | Mục đích | Ví dụ |
|---|---|---|
| `ANNG_MODEL` | Model mặc định | `gpt-4o`, `claude-3-opus` |
| `ANNG_API_KEY` | API key | `sk-...` |
| `ANNG_API_BASE` | Custom API base | `http://localhost:8080/v1` |
| `ANNG_MAX_TOKENS` | Token limit | `4096` |
| `ANNG_TEMPERATURE` | Temperature | `0.7` |
| `ANNG_VERBOSE` | Verbosity | `true` |
| `ANNG_CONFIG_DIR` | Config directory | `~/.anng/` |
| `ANNG_SKILLS_DIR` | Skills directory | `~/.anng/skills/` |

#### Slash commands (15+)

**Lệnh hệ thống (System commands):**

| Command | Mô tả |
|---|---|
| `/exit` | Thoát session |
| `/new` | New conversation |
| `/resume` | Resume session từ file |
| `/continue` | Tiếp tục generation |
| `/undo` | Undo last turn |
| `/mcp` | MCP server management |
| `/settings` | Open settings UI |
| `/model` | Change model |
| `/skills` | List/enable skills |
| `/raw` | Raw prompt mode |
| `/init` | Initialize project config |

**Lệnh skills (Skill commands):**

| Command | Mô tả |
|---|---|
| `/team` | Team view (simulated) |
| `/team-dp` | Team divide-and-conquer pattern |
| `/team-wf` | Team workflow pattern |
| `/custom-agents` | Custom agent config |

### Cline

#### Interface Modes

| Mode | Mô tả | Best for |
|---|---|---|
| **VS Code Extension** | Full IDE integration, có UI panels | Complex features, code review |
| **Terminal (headless)** | CLI mode, không có VS Code UI | CI/CD, scripting |
| **Inline chat** | Chat trong file editor | Quick edits |

#### Slash commands

| Command | Mô tả |
|---|---|
| `/thinking` | Toggle thinking mode |
| `/task` | Create structured task |
| `/[skill-name]` | Invoke skill (200+) |
| `/[custom]` | Custom registered commands |

#### Cấu hình

- **cline.json** — Project-level config (skills, MCP, model)
- **MCP settings** — MCP server definitions
- **VS Code settings** — Editor-level preferences
- **Environment variables** — `CLINE_MODEL`, `CLINE_API_KEY`, ...

#### VS Code Integration Features

- **Command Palette:** `Cmd+Shift+P` → "Cline: ..."
- **Keybindings:** Customizable shortcuts
- **Editor Context Menu:** Right-click → "Ask Cline"
- **File Explorer:** File operations tự động context-aware
- **Git Integration:** Branch management, commit messages
- **Terminal Integration:** Chạy commands trong VS Code terminal
- **Problem Panel:** Hiển thị lỗi từ Cline analysis

### So sánh CLI

| Aspect | ANNG CLI | Cline |
|---|---|---|
| **TUI** | ✅ Bubble Tea đẹp, spinner, permission prompt | ❌ Basic terminal hoặc VS Code UI |
| **Headless/CI** | ✅ `--json` flag, exit codes | ✅ Non-interactive mode |
| **Provider config** | ⚠️ Thủ công settings.json | ✅ UI settings + auto-detect |
| **Flag consistency** | ✅ `-v`=verbose, `--version`=version | ✅ Standard |
| **Slash commands** | ✅ 15+ commands | ✅ 200+ skills as commands |
| **File completion** | ✅ `@file` mention autocomplete | ✅ VS Code native file picker |


## 3. Harness Engineering

### ANNG CLI — Tool System

```go
// internal/tools/executor.go
type ToolHandler func(ctx context.Context, args map[string]interface{}) (string, error)
type ToolRegistry struct { handlers map[string]ToolHandler }
```

**11 registered tools:**
| # | Tool | File | Mô tả | Mutating |
|---|---|---|---|---|
| 1 | `bash` | `bash.go` | Execute shell commands via PTY | ✅ |
| 2 | `read_file` | `read.go` | Read file với line numbers | ❌ |
| 3 | `write_to_file` | `write.go` | Write file (must-read-before-write) | ✅ |
| 4 | `replace_file_content` | `edit.go` | Single string replace | ✅ |
| 5 | `multi_replace_file_content` | `file.go` | Bottom-up sorted multi-replace | ✅ |
| 6 | `ask_question` | `ask_user_question.go` | User interaction | ❌ |
| 7 | `UpdatePlan` | `update_plan.go` | Plan recording | ❌ |
| 8 | `search_web` | `web_search.go` | Web search API | ❌ |
| 9 | `HttpRequest` | `http_request.go` | HTTP client | ❌ |
| 10 | `AnalyzeProject` | `analyze_project.go` | AST + directory walk | ❌ |
| 11 | MCP tools | dynamic | `mcp__<server>__<tool>` | varies |

#### Tool Execution Flow

```
Agent generates tool_call JSON
  → ToolRegistry.Lookup(tool_name)
    → ToolHandler(ctx, args)
      → [Permission check] (if mutating)
        → [User confirm]? (if not --yolo)
          → Execute tool
            → Return result string or error
              → Agent receives result
                → Generate next message
```

**Step-by-step flow cho bash tool:**
```
1. LLM returns: tool_call(name="bash", args={"command": "ls -la"})
2. ToolRegistry["bash"](ctx, args)
3. policy.IsMutating("bash") → true
4. tui.PermissionPrompt("Allow bash: ls -la?") → [y/N]
5. If denied → return "Permission denied by user"
6. If approved → pty.Write("ls -la\n")
7. pty.Read() → collect output with timeout
8. Return output string
9. Agent receives → generates next response
```

#### Bash Execution Details (`internal/tools/bash.go`)

```go
// PTY-based execution vs subprocess
// Ưu điểm PTY: interactive commands work (nano, vim, less)
// Nhược điểm: PTY output parsing phức tạp hơn
type PtyCommand struct {
    Command  string
    Timeout  time.Duration  // default: 30s
    WorkDir  string
    EnvVars  []string
}

// Execution safeguards:
// - Timeout: 30s default, configurable
// - Output truncation: max 10000 lines
// - Working directory isolation
// - Environment variable injection
// - Signal handling (SIGINT, SIGTERM)
```

#### Permission Prompt Flow

```
LLM muốn chạy bash/write/edit
  → Policy Engine check: tool ∈ mutatingTools?
  → If yes → TUI PermissionPromptModel hiển thị:
      ┌──────────────────────────────────────┐
      │ 🔒 ANNG CLI needs to run:            │
      │                                      │
      │   bash: go build ./cmd/anng/         │
      │                                      │
      │ [Allow] [Allow Always] [Deny]        │
      └──────────────────────────────────────┘
  → Nếu --yolo flag: auto-approve tất cả
  → Nếu --plan flag: block tất cả mutations
```

### Policy Engine (`internal/agent/policy.go`)

```go
var mutatingTools = map[string]bool{
    "bash": true, "write_to_file": true,
    "replace_file_content": true, "multi_replace_file_content": true,
}
// Plan mode blocks all mutating tools
```

**Policy rules:**
- **Normal mode:** Mutating tools require user confirmation (trừ khi `--yolo`)
- **Plan mode (`--plan`):** Block ALL mutating tools, chỉ cho phép đọc
- **`--yolo` mode:** Auto-approve tất cả mutations
- **Tool gating:** Có thể mở rộng thêm tools vào mutating list

### File State Tracking (`internal/tools/state.go`)

```go
var fileStates = map[string]map[string]FileState{} // sessionID → filePath → content
// Enforces: must-read-before-write, detects external modifications
// Max 100 sessions with LRU eviction
```

**File state lifecycle:**
```
1. read_file("src/main.go") → store content in fileStates[sessionID]["src/main.go"]
2. external edit? → fileStates detects checksum mismatch → warn user
3. write_to_file("src/main.go", newContent) → compare with stored state
   → If never read first → BLOCK: "You must read the file before writing"
   → If stored state ≠ current file → WARN: "File was modified externally"
   → If OK → proceed with write
4. Session end → LRU eviction if >100 sessions
```

**Safety guarantees:**
- **Read-before-write enforcement:** Agent không thể ghi file chưa đọc
- **External modification detection:** Phát hiện nếu file bị sửa bởi tool khác
- **Race condition prevention:** Bottom-up sorting cho multi-replace
- **Session isolation:** Mỗi session có file state riêng

### Cline — Harness Engineering

**50+ tools including:**
- `read_files`, `search_codebase`, `run_commands`
- `fetch_web_content`, `editor`, `ask_question`
- `spawn_agent` — **Subagent spawning** (unique!)
- `team_*` — Team orchestration (spawn, task, run, message, mission_log)
- `skills` — Skill execution
- `mcp_*` — MCP integration

**Key capabilities ANNG CLI lacks:**
- `spawn_agent(systemPrompt, task)` → sub-agent with fresh context
- `team_spawn_teammate(agentId, rolePrompt)` → persistent teammate
- `team_task(action, title, description, dependsOn)` → DAG task management
- `team_run_task(agentId, task, runMode)` → sync/async dispatch
- `team_mission_log(kind, summary)` → progress tracking

### So sánh Harness Engineering

| Aspect | ANNG CLI | Cline |
|---|---|---|
| **Tool count** | 11 + MCP dynamic | 50+ + MCP |
| **Subagent spawning** | ❌ | ✅ `spawn_agent` |
| **Team orchestration** | ⚠️ Simulated | ✅ Real `team_*` tools |
| **Task DAG** | ❌ | ✅ `dependsOn` |
| **Skill count** | ~10 bundled | 200+ |
| **Permission system** | ✅ UI prompt | ✅ Permission prompts |
| **File state safety** | ✅ Read-before-write | ✅ Context state |
| **Mock/Test mode** | ⚠️ Ad-hoc env var | ✅ Structured test harnesses |
| **Error recovery** | ⚠️ Keyword matching | ✅ Multi-stage verification |
| **Planning** | ❌ | ✅ `writing-plans` + `executing-plans` |
| **Background tasks** | ✅ `TaskManager` | ✅ Async tool calls |


## 4. Systems Architecture

### ANNG CLI — Component Map

```
cmd/anng/main.go
├── ParseCLIOptions()
├── config.LoadConfig() → Settings
├── agent.ResolveProvider() → ProviderKind
├── agent.ResolveCredentials()
│
├── [TUI mode]
│   └── tui.InitialModelWithConfig()
│       ├── ChatViewModel (input + log buffer)
│       ├── SettingsViewModel, SessionListModel
│       ├── SkillsListModel, McpStatusModel
│       ├── PermissionPromptModel
│       ├── TeamViewModel (simulated)
│       ├── ModelSelectModel, UndoSelectorModel
│
└── [Headless mode]
    └── agent.RunHeadless()
        └── agent.NewOrchestrator() + orch.Run()
            ├── PromptEngine.BuildSystemPrompt()
            ├── tokenizer.ShouldCompactContext()
            ├── OpenAI API call
            └── Tool execution loop
```

### ANNG CLI — Agent Loop Detail

```go
// Pseudocode: internal/agent/orchestrator.go
func (o *Orchestrator) Run(ctx context.Context) (*RunResult, error) {
    // 1. Build system prompt with skills, tools, plan
    systemPrompt := o.promptEngine.BuildSystemPrompt(o.activeSkills)
    
    // 2. Initialize message history
    messages := []Message{
        {Role: "system", Content: systemPrompt},
        {Role: "user", Content: o.userPrompt},
    }
    
    // 3. Agent loop (synchronous, turn-based)
    for turn := 0; turn < o.maxTurns; turn++ {
        // a. Check context budget
        if o.tokenizer.ShouldCompactContext(messages) {
            messages = o.tokenizer.CompactContext(messages)
        }
        
        // b. API call (synchronous)
        response, err := o.client.CreateChatCompletion(
            ctx, messages, tools,
        )
        
        // c. Parse response
        if response.Choices[0].FinishReason == "stop" {
            return &RunResult{Response: response.Content}, nil
        }
        
        // d. Process tool calls (SINGLE turn, not parallel)
        for _, toolCall := range response.Choices[0].Message.ToolCalls {
            result, err := o.toolRegistry.Execute(ctx, toolCall)
            messages = append(messages, Message{
                Role: "tool", 
                ToolCallID: toolCall.ID,
                Content: result,
            })
        }
    }
}
```

**Key characteristics:**
- **Synchronous:** Mỗi turn chờ API response hoàn toàn trước khi xử lý
- **Sequential tool calls:** Multiple tool calls processed one-by-one (không parallel)
- **Single response per turn:** LLM chỉ gửi 1 response message mỗi turn
- **Turn limit:** `--max-turns` flag (default 20), tránh infinite loops

### ANNG CLI — Context Compaction (`internal/tokenizer/compacter.go`)

```go
// Token estimation heuristic (không dùng tokenizer thật)
// Character-based approximation để giảm latency
func ShouldCompactContext(messages []Message) bool {
    totalChars := 0
    for _, msg := range messages {
        totalChars += len(msg.Content)
    }
    // Heuristic: ~4 chars/token
    estimatedTokens := totalChars / 4
    return estimatedTokens > modelContextLimit * 0.75  // 75% threshold
}

func CompactContext(messages []Message) []Message {
    // Strategy: Summarize earlier turns, keep recent
    // - Giữ system prompt (important for tool definitions)
    // - Giữ last N turns (configurable)
    // - Summarize middle turns thành 1 message
    return compacted
}
```

**So sánh với Cline:**
- Cline dùng tokenizer thật (tiktoken) → chính xác hơn
- ANNG CLI dùng heuristic character-based → nhanh nhưng kém chính xác
- Cline compact context theo nhiều strategy: summarize, drop, restructure

### ANNG CLI — Session Management (`internal/session/store.go`)

```json
// JSONL format: 1 JSON object per line
// Mỗi turn = 1 object {role, content, tool_calls, timestamp}
// Example session file (.anng/sessions/2026-06-25_143022.jsonl):
{"role":"system","content":"You are ANNG CLI...","timestamp":"2026-06-25T14:30:22Z"}
{"role":"user","content":"Implement auth middleware","timestamp":"2026-06-25T14:30:22Z"}
{"role":"assistant","content":"I'll create the auth middleware...","timestamp":"2026-06-25T14:30:25Z"}
{"role":"tool","tool_call_id":"call_abc123","name":"read_file","content":"package main...","timestamp":"2026-06-25T14:30:26Z"}
{"role":"assistant","content":"Here's the implementation...","timestamp":"2026-06-25T14:30:30Z"}
```

**Session features:**
- **Checkpoint/Restore:** `/resume` để load lại session cũ
- **Git integration:** Auto-save checkpoints khi git operations
- **LRU eviction:** Max 100 sessions, xóa cũ nhất khi quá limit
- **Undo support:** `/undo` rollback turn cuối

### Core packages

| Package | Files | Responsibility |
|---|---|---|
| `internal/agent/` | 7 files | Orchestrator, headless, policy, prompt engine, provider |
| `internal/config/` | `config.go` | Cấu hình settings |
| `internal/tui/` | 15+ files | Bubble Tea views |
| `internal/tools/` | 13 files | Tool implementations |
| `internal/mcp/` | 5 files | MCP client + manager |
| `internal/session/` | `store.go` | Session persistence |
| `internal/skills/` | 2 files | Skill discovery |
| `internal/tokenizer/` | `compacter.go` | Token estimation |

### So sánh Systems

| Aspect | ANNG CLI | Cline |
|---|---|---|
| **Agent loop** | Synchronous, single-turn | Async, parallel tool calls |
| **Context compaction** | ✅ Character-based, per-model | ✅ Tokenizer-based |
| **Parallel tool calling** | ⚠️ Sequential loop | ✅ Native parallel |
| **Error recovery** | ⚠️ Keyword matching | ✅ Multi-stage verification |
| **Session** | ✅ JSONL persistence | ✅ Index file + cache |
| **Git integration** | ✅ Checkpoint load/save | ✅ Full git workflow |
| **Subagent spawning** | ❌ | ✅ `spawn_agent` |
| **Team orchestration** | ⚠️ Simulated (spacebar demo) | ✅ Real DAG dispatch |
| **Task dependency** | ❌ | ✅ `team_task` + `dependsOn` |

## 5. MCP Protocol

### ANNG CLI (`internal/mcp/`)

#### Package Files

| File | Purpose |
|---|---|
| `client.go` | Initialize, ListTools, CallTool, ListResources |
| `transport.go` | StdioTransport: Send, SendNotification, Close, Healthy |
| `manager.go` | MCPManager: ConnectAll, DisconnectAll, AutoReconnectLoop |
| `config.go` | MCPServerConfig loader |
| `tools.go` | ToOpenAITools converter + namespace parser |

#### Protocol Details

**Protocol:** JSON-RPC 2.0, spec version 2024-11-05

**Tool namespacing:** `mcp__<server>__<tool>`  
Ví dụ: `mcp__filesystem__read_file` → server="filesystem", tool="read_file"

**State machine:**
```
disconnected
  → [connect attempt]
    → connecting
      → [success] → connected
      → [failure] → error → [30s retry] → connecting
```

**Auto-reconnect:** 30s loop, exponential backoff (max 5×2s)

#### JSON-RPC Message Examples

**Initialize request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "tools": {},
      "resources": {}
    },
    "clientInfo": {
      "name": "anng-cli",
      "version": "0.1.0"
    }
  }
}
```

**ListTools request:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list",
  "params": {}
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "tools": [
      {
        "name": "read_file",
        "description": "Read contents of a file",
        "inputSchema": {
          "type": "object",
          "properties": {
            "path": {"type": "string"}
          },
          "required": ["path"]
        }
      }
    ]
  }
}
```

**CallTool request:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "read_file",
    "arguments": {
      "path": "/tmp/test.txt"
    }
  }
}
```

#### MCP to OpenAI Tool Conversion (`internal/mcp/tools.go`)

```go
// MCP tool → OpenAI tool definition
func ToOpenAITools(mcpTools []mcp.Tool) []openai.Tool {
    var tools []openai.Tool
    for _, t := range mcpTools {
        tools = append(tools, openai.Tool{
            Type: "function",
            Function: &openai.FunctionDefinition{
                Name:        "mcp__" + serverName + "__" + t.Name,
                Description: t.Description,
                Parameters:  t.InputSchema,  // pass through JSON Schema
            },
        })
    }
    return tools
}

// OpenAI tool_call → MCP tool call
func ParseMcpToolCall(toolCall string) (server, tool string, args map[string]interface{}) {
    // "mcp__filesystem__read_file" → server="filesystem", tool="read_file"
    parts := strings.SplitN(toolCall, "__", 3)
    return parts[1], parts[2], args
}
```

#### Error Handling Patterns

| Error type | Handled? | Strategy |
|---|---|---|
| Connection refused | ✅ | Retry with backoff |
| Timeout | ✅ | 30s timeout per call |
| Tool not found | ✅ | Return error message to LLM |
| Invalid params | ✅ | Schema validation error |
| Server crash | ✅ | Auto-reconnect loop |
| Stale connection | ✅ | Health check before each call |

### Cline

- **Full MCP spec compliance** — Implement đầy đủ tất cả features
- **Transports:** Stdio + SSE (Server-Sent Events)
- **Tool discovery:** Auto-discover khi server initialize
- **Namespacing:** Tương tự ANNG CLI `mcp__server__tool`
- **Auto-reconnect:** Built-in, configurable retry policy
- **Sampling support:** LLM có thể request sampling từ host
- **Roots support:** Server có thể đề xuất roots directories
- **Prompt templates:** Server có thể expose prompt templates
- **MCP Registry:** Integration với MCP registry để discover servers
- **Concurrent calls:** Async, không blocking

### So sánh MCP

| Aspect | ANNG CLI | Cline |
|---|---|---|
| **Transport** | Stdio only | Stdio + SSE |
| **Spec version** | 2024-11-05 | Latest MCP spec |
| **Auto-reconnect** | ✅ 30s + backoff | ✅ Built-in |
| **Resource discovery** | ✅ ListResources | ✅ Full resources |
| **Prompt templates** | ❌ | ✅ |
| **Sampling** | ❌ | ✅ |
| **Roots** | ❌ | ✅ |
| **Concurrent calls** | ⚠️ Mutex-guarded | ✅ Async concurrent |

## 6. Skills System

### ANNG CLI — Skill Architecture

#### Search paths (ordered by priority)

```
1. ~/.gemini/antigravity-cli/builtin/skills/     (built-in, lowest priority)
2. ~/.gemini/config/skills/                       (legacy gemini config)
3. ~/.anng/skills/                                (user global)
4. ~/.agents/skills/                              (shared agents config)
5. <project>/.anng/skills/                        (project-specific)
6. <project>/.agents/skills/                      (project agents)
```

Path cuối cùng ghi đè path đầu tiên (project-specific > built-in).

#### Skill Loading Flow (`internal/skills/discovery.go`)

```go
func LoadActiveSkills(config *Config) []Skill {
    var skills []Skill
    
    // 1. Scan all search paths for .md files
    for _, dir := range config.SkillDirs {
        files := glob(dir + "/*.md")
        for _, file := range files {
            skill := parseSkill(file)
            if skill != nil && skill.Enabled {
                skills = append(skills, *skill)
            }
        }
    }
    
    // 2. Parse YAML frontmatter from each .md file
    // 3. Filter by ActiveSkills config list (nếu có)
    // 4. Merge with default skills
    // 5. Sort by priority (name ordering)
    return skills
}
```

#### Bundled Skills (~10)

| Skill | Mô tả | File |
|---|---|---|
| `agent-drift-guard` | Phát hiện agent drift trong conversations | `agent-drift-guard.md` |
| `codegraph` | Phân tích dependency graph của codebase | `codegraph.md` |
| `github-pr` | GitHub Pull Request workflows | `github-pr.md` |
| `plan` | Planning mode cho complex tasks | `plan.md` |
| `skill-digester` | Phân tích và tóm tắt skills khác | `skill-digester.md` |
| `skill-writer` | Tạo skills mới từ examples | `skill-writer.md` |
| `karpathy-guidelines` | Andrej Karpathy's coding guidelines | `karpathy-guidelines.md` |
| `plan-and-execute` | Plan-then-execute workflow pattern | `plan-and-execute.md` |
| `unified-guidelines` | Unified coding conventions | `unified-guidelines.md` |
| `anng-self-refer` | Self-referencing ANNG CLI knowledge | `anng-self-refer.md` |

#### Full Skill Format Example

```markdown
---
name: codegraph
description: >
  Analyze the dependency graph of the codebase to understand 
  relationships between packages, identify circular dependencies, 
  and suggest refactoring opportunities.
version: 1.0.0
author: ANNG CLI
tags: [analysis, dependencies, refactoring]
enabled: true
---

# CodeGraph Analysis

## Capabilities
- Parse Go import graphs
- Detect circular dependencies
- Measure package coupling
- Suggest refactoring targets

## Usage
When asked about code structure, run:
1. `go list -json ./...` to get package metadata
2. Parse imports to build dependency graph
3. Report findings with coupling scores

## Guidelines
- Focus on circular dependencies first (highest impact)
- Report coupling scores: <0.3 = loose, 0.3-0.7 = moderate, >0.7 = tight
- Suggest concrete refactoring steps for tight coupling
```

#### ActiveSkills Merge Logic

```go
// Cách ActiveSkills kết hợp với system prompt:
// 1. User enables skills via /skills command hoặc config
// 2. ActiveSkills = list of skill names
// 3. PromptEngine.BuildSystemPrompt():
//    - Loads all ActiveSkills
//    - Concatenates their content
//    - Injects into system prompt as context
// 4. LLM receives all skill context in system message

func (p *PromptEngine) BuildSystemPrompt(activeSkills []string) string {
    prompt := baseSystemPrompt
    
    for _, skillName := range activeSkills {
        skill := skillRegistry.Get(skillName)
        if skill != nil {
            prompt += "\n---\n"
            prompt += skill.Content
        }
    }
    
    return prompt
}
```

### Cline — 200+ skills by domain

| Domain | Count | Examples |
|---|---|---|
| **Development** | 50+ | react-patterns, python-patterns, golang-patterns, rust-patterns, django-patterns, nestjs-patterns |
| **Testing** | 15+ | tdd, python-testing, golang-testing, e2e-testing, browser-qa |
| **Security** | 10+ | security-review, security-scan, safety-guard, gateguard |
| **Planning** | 10+ | writing-plans, executing-plans, planning-and-task-breakdown |
| **Harness** | 20+ | subagent-driven-development, verification-loop, autonomous-loops, benchmark |
| **Architecture** | 15+ | hexagonal-architecture, clean-architecture, architecture-decision-records |
| **Infra** | 15+ | kubernetes-patterns, docker-patterns, postgres-patterns, redis-patterns |
| **Frontend** | 20+ | nextjs-turbopack, vite-patterns, motion-ui, design-system |
| **Backend** | 20+ | fastapi-patterns, springboot-patterns, quarkus-patterns, laravel-patterns |
| **Mobile** | 10+ | swiftui-patterns, compose-multiplatform-patterns, dart-flutter-patterns |
| **Database** | 10+ | postgres-patterns, redis-patterns, prisma-patterns, mysql-patterns |
| **DevOps** | 10+ | kubernetes-patterns, docker-patterns, deployment-patterns |
| **Other** | 15+ | documentation, product-capability, research-ops, benchmark |

**Skill stacking:** Cline cho phép stack nhiều skills cùng lúc — ví dụ dùng `tdd` + `python-patterns` + `security-review` cùng lúc để vừa TDD vừa theo Python patterns vừa review security.

### So sánh Skills

| Aspect | ANNG CLI | Cline |
|---|---|---|
| **Total** | ~10 bundled | 200+ |
| **Format** | YAML frontmatter + Markdown | Markdown with patterns |
| **Discovery** | Multi-path filesystem (6 paths) | Single directory |
| **Slash invocation** | ✅ `/name` | ✅ `/name` |
| **Active skills** | ✅ `ActiveSkills` array | ✅ Skill stacking (multi-select) |
| **Self-referencing** | ✅ anng-self-refer | ✅ everything-claude-code |
| **Skill metadata** | ✅ name, description, version, tags, author | ⚠️ Basic (name + description) |
| **Versioning** | ✅ version field in frontmatter | ❌ No versioning |
| **Override priority** | ✅ Project skills > user > built-in | ❌ Flat namespace |
| **Skill search** | ❌ No built-in search | ✅ Skill discovery tools |
| **Dynamic loading** | ✅ Scan at startup | ✅ Load on demand |


## 7. Testing & Quality

### ANNG CLI — Test Coverage

| Aspect | ANNG CLI | Cline |
|---|---|---|
| **Unit tests** | ✅ 30+ files, all packages | ✅ Via TDD skill |
| **Integration tests** | ✅ MCP E2E mock | ✅ E2E testing skill |
| **Benchmarking** | ❌ | ✅ benchmark skill |
| **Regression testing** | ❌ | ✅ ai-regression-testing |
| **Browser QA** | ❌ | ✅ browser-qa |
| **Security scanning** | ❌ (manual audit) | ✅ security-scan |

### ANNG CLI — Test File Map

```
internal/
├── agent/
│   ├── orchestrator_test.go    # Agent loop tests
│   ├── policy_test.go          # Policy engine tests
│   ├── provider_test.go        # Provider resolution tests
│   └── prompt_test.go          # System prompt building tests
├── tools/
│   ├── bash_test.go            # PTY execution tests
│   ├── read_test.go            # File reading tests
│   ├── write_test.go           # Read-before-write enforcement tests
│   ├── edit_test.go            # Content replacement tests
│   ├── file_test.go            # Multi-replace tests
│   └── executor_test.go        # Tool registry tests
├── mcp/
│   ├── client_test.go          # MCP client tests
│   ├── transport_test.go       # Stdio transport tests
│   └── manager_test.go         # Connection lifecycle tests
├── config/
│   └── config_test.go          # Settings loading tests
├── session/
│   └── store_test.go           # Session persistence tests
├── skills/
│   └── discovery_test.go       # Skill discovery tests
├── tokenizer/
│   └── compacter_test.go       # Context compaction tests
├── tui/
│   ├── chat_test.go            # Chat view tests
│   ├── settings_test.go        # Settings view tests
│   └── prompt_test.go          # Permission prompt tests
└── ...
```

**Test patterns used:**
- **Table-driven tests:** Go-style `tests []struct{name, input, expected}` pattern
- **Mock clients:** Fake OpenAI client for deterministic testing
- **MCP E2E mock:** Simulated MCP server for integration tests
- **File system isolation:** Temp directories per test case
- **PTY mock:** Simulated terminal for bash tool tests

### Cline — Test Infrastructure

Cline không có test suite cố định (phụ thuộc vào project), nhưng có skills hỗ trợ testing:

| Skill | Mục đích |
|---|---|
| `tdd` | Test-Driven Development workflow |
| `e2e-testing` | End-to-end test generation |
| `browser-qa` | Visual regression testing |
| `ai-regression-testing` | AI output regression detection |
| `benchmark` | Performance benchmarking |
| `python-testing` | Python-specific test patterns |
| `golang-testing` | Go-specific test patterns |
| `perl-testing` | Perl test automation |
| `security-scan` | Security vulnerability scanning |

### So sánh Testing Strategy

| Aspect | ANNG CLI | Cline |
|---|---|---|
| **Framework** | Go `testing` package | Multi-language (jest, pytest, go test) |
| **Mock strategy** | Interface-based mocks | Context-aware mocks |
| **Coverage** | ~60-70% core packages | Project-dependent |
| **CI integration** | go test ./... | Via skills |
| **Test speed** | <5s full suite | Variable |
| **Property testing** | ❌ | ✅ Via skill |
| **Fuzz testing** | ❌ | ✅ Via skill |
| **Mutation testing** | ❌ | Via custom skill |

## 8. Routing

### ANNG CLI — State-Based Routing

ANNG CLI dùng **state-based routing** trong TUI layer:

```go
type TuiView string
const ( ViewChat, ViewSessionList, ViewUndo, ViewMcpStatus,
        ViewSettings, ViewModelSelect, ViewSkillsList,
        ViewInput, ViewTeam )
func (m AppModel) Update(msg) { switch m.CurrentView { ... } }
```

**Đặc điểm:**
- **TUI routing:** Message passing qua Bubble Tea `Update(msg) tea.Msg` — mỗi view tự xử lý message riêng
- **Headless routing:** Synchronous loop trong `Orchestrator.Run()` — tool call → response → next tool call
- **Tool routing:** `ToolRegistry` lookup theo string key (`map[string]ToolHandler`)
- **Team routing:** Simulated team UI — không có real agent-to-agent routing
- **MCP routing:** Namespace prefix `mcp__<server>__<tool>` → MCPManager dispatch
- **No task DAG:** Không có dependency graph giữa các task

### Cline — Message-Passing + DAG Routing

Cline dùng **multi-layer routing architecture**:

```
User Input
  → CLI / VS Code handler
    → Agent loop (async event-driven)
      → Tool router (structured tool definitions)
        → Skill router (skill name → skill content)
          → Subagent router (spawn_agent → new context)
            → Team router (team_task DAG dispatch)
```

**Đặc điểm:**
- **Tool routing:** Structured definitions với typed schemas + validation
- **Skill routing:** Tên skill → markdown content → injected vào system prompt
- **Subagent routing:** `spawn_agent` → isolated context riêng → async result
- **Team routing:** `team_task` với `dependsOn` → DAG execution engine
- **MCP routing:** Discovery → namespace → concurrent dispatch
- **Parallel fan-out:** Nhiều tool calls trong một turn (async/await pattern)

### So sánh Routing

| Aspect | ANNG CLI | Cline |
|---|---|---|
| **TUI routing** | State machine (`switch view`) | VS Code message passing |
| **Tool dispatch** | String map lookup | Typed schemas |
| **Tool parallelism** | ❌ Sequential | ✅ Async parallel |
| **Subagent routing** | ❌ | ✅ Isolated contexts |
| **Team DAG** | ❌ | ✅ `dependsOn` graph |
| **Skill routing** | Filesystem path discovery | Name → content injection |
| **MCP routing** | Prefix stripping | Namespace + concurrent |
| **Headless routing** | Synchronous loop | Event-driven loop |
| **Error routing** | String matching fallback | Multi-stage retry |

## 9. dmux Workflow Integration

dmux ([github.com/standardagents/dmux](https://github.com/standardagents/dmux)) là một **tmux-based orchestration layer** cho AI agent sessions. Nó có thể hoạt động như một **lớp bổ sung song song** cho cả ANNG CLI và Cline, đặc biệt giúp ANNG CLI bù đắp điểm yếu về parallel orchestration.

### dmux + ANNG CLI: Workflow Patterns

Kết hợp dmux với ANNG CLI tạo ra parallel orchestration mà ANNG CLI thiếu nội tại:

```bash
# Khởi động dmux session
dmux

# Pane 1 (Research): ANNG CLI nghiên cứu
# (Press 'n' trong dmux, nhập lệnh)
anng -p "Research best practices for Go middleware security. Write findings to /tmp/research.md" --yolo

# Pane 2 (Implement): ANNG CLI implement
# (Pane riêng biệt, không phụ thuộc)
anng -p "Implement auth middleware in internal/middleware/auth.go with rate limiting" --yolo

# Press 'm' để merge kết quả về main session
```

### dmux + Cline: Enhanced Parallelism

Cline đã có `spawn_agent` và `team_*` tools, nhưng dmux bổ sung:

```
Pane 1 (Claude Code CLI): "Review security in src/api/"
Pane 2 (ANNG CLI headless): "Validate Go AST in internal/tools/"
Pane 3 (Codex): "Refactor utils package"

# dmux quản lý tmux panes, mỗi pane chạy một harness khác nhau
# Cross-harness orchestration mà Cline team tools không làm được
```

### Workflow Pattern 1: Research + Implement (dmux Bridge)

```
Pane 1 (ANNG CLI): "Research rate limiting algorithms. Write to /tmp/research.md" --yolo
Pane 2 (Cline headless): "Implement token bucket in Go" --yolo

# Sau khi Pane 1 hoàn thành → merge findings into Pane 2
```

**Ý nghĩa:** Dùng dmux để phối hợp 2 harness khác nhau — research bằng ANNG CLI (nhanh, nhẹ), implement bằng Cline (nhiều tools hơn).

### Workflow Pattern 2: Multi-File Feature (ANNG CLI Scale-Out)

Vì ANNG CLI không có subagent spawning, dmux cung cấp **external parallelism**:

```
# dmux tạo N panes, mỗi pane chạy ANNG CLI headless riêng
Pane 1: anng -p "Create database schema for billing" --yolo
Pane 2: anng -p "Build billing API endpoints in src/api/billing/" --yolo
Pane 3: anng -p "Create billing dashboard UI components" --yolo

# Merge all via dmux 'm' key
```

### Workflow Pattern 3: Code Review Pipeline (Cross-Harness)

```
Pane 1 (ANNG CLI): "Analyze project structure with AnalyzeProject tool" --json
Pane 2 (Cline): "Review src/api/ for security vulnerabilities"
Pane 3 (Codex): "Review test coverage gaps"

# Merge all reviews into a single report via dmux
```

### Workflow Pattern 4: Git Worktree Isolation (ECC Helper)

Sử dụng ECC `orchestrate-worktrees.js` để tách biệt hoàn toàn:

```json
{
  "sessionName": "parallel-features",
  "baseRef": "HEAD",
  "launcherCommand": "anng -p {task} --yolo",
  "workers": [
    { "name": "auth", "task": "Implement OAuth2 middleware in internal/auth/" },
    { "name": "billing", "task": "Create billing API endpoints" },
    { "name": "docs", "task": "Write API documentation" }
  ]
}
```

Mỗi worker chạy trong worktree riêng → zero file conflicts.

### dmux Impact Matrix

| ANNG CLI Weakness | dmux Solution | Mức độ |
|---|---|---|
| No subagent spawning | External tmux panes = parallel agents | 🟢 Cao |
| Fake team orchestration | Real multi-pane orchestration | 🟢 Cao |
| No planning system | Plan trong từng pane riêng | 🟡 Trung bình |
| Skills limited | Mỗi pane dùng skill khác nhau | 🟡 Trung bình |
| No verification loops | Pane watcher + pane fixer song song | 🟢 Cao |
| No streaming | Mỗi pane async riêng | 🟡 Trung bình |

## 10. Điểm mạnh/yếu

### ANNG CLI — Strengths
1. **Go performance** — Binary 12MB, no deps, fast startup
2. **TUI quality** — Bubble Tea, spinner, permission prompt
3. **Provider abstraction** — Clean heuristic detection
4. **File state safety** — Read-before-write prevents data loss
5. **Session persistence** — JSONL + checkpoint/restore
6. **MCP integration** — Stdio with auto-reconnect
7. **Policy engine** — Clean plan mode blocking
8. **Works standalone** — No editor dependency

### ANNG CLI — Weaknesses
1. **No subagent spawning** — Cannot parallelize internally
2. **Team orchestration fake** — Spacebar simulation
3. **No planning system** — No formal plan creation
4. **Skills limited** — ~10 vs 200+
5. **No verification loops** — No auto-retry
6. **No streaming** — Synchronous API only
7. **No browser/visual testing**
8. **No formal benchmarking**
9. **MCP spec coverage basic** — No sampling/roots

### Cline — Strengths
1. **Subagent system** — `spawn_agent` for parallelism
2. **Team orchestration** — Real DAG task dispatch
3. **200+ skills** — Extensive domain coverage
4. **Planning system** — Structured creation + execution
5. **Verification loops** — Auto-retry + TDD cycles
6. **Multi-provider** — OpenAI, Anthropic, Google, Bedrock...
7. **Full MCP spec** — Stdio + SSE + sampling + roots
8. **Browser QA** — Visual testing
9. **Security scanning** — Built-in tools

### Cline — Weaknesses
1. **VS Code dependency** — Not standalone
2. **Node.js overhead** — Heavier runtime
3. **No native TUI** — Basic terminal mode
4. **No Go compilation** — Cannot natively parse Go AST

## 11. Cơ hội cải tiến cho ANNG CLI

### Priority 1: Subagent System
```go
// internal/agent/subagent.go
type Subagent struct {
    ID     string
    Prompt string
    Result chan string
}

func SpawnSubagent(ctx context.Context, prompt string) *Subagent {
    s := &Subagent{ID: generateUUID(), Prompt: prompt, Result: make(chan string, 1)}
    go func() {
        res, _ := RunHeadless(ctx, prompt, true, false, false, false, 10)
        s.Result <- res.Response
    }()
    return s
}
```

### Priority 2: Real Team Orchestration
- Replace `internal/tui/team_view.go` simulation with real headless agent dispatch
- Fan-out tasks to parallel agents, fan-in collect results
- Support `dependsOn` DAG for task dependency

### Priority 3: Planning System
- New package `internal/plan/` with Plan struct
- CreatePlan/ExecutePlan methods
- Save to `docs/superpowers/plans/`

### Priority 4: Verification Loops
- Add retry logic to orchestrator
- Auto-detect test failures and retry with fixes
- Implement Test → Fix → Verify cycle pattern

### Priority 5: MCP Spec Expansion
- Add SSE transport
- Add prompts/list, roots/list, sampling/create
- Full spec compliance (2024-11-05 base, latest as target)

### Priority 6: dmux-aware Orchestration Integration

```go
// internal/orchestration/dmux.go
package orchestration

type DmuxWorker struct {
    Name      string `json:"name"`
    Task      string `json:"task"`
    Worktree  string `json:"worktree,omitempty"`
    Handoff   string `json:"handoff,omitempty"`
}

type DmuxPlan struct {
    SessionName    string       `json:"sessionName"`
    BaseRef        string       `json:"baseRef"`
    LauncherCmd    string       `json:"launcherCommand"`
    Workers        []DmuxWorker `json:"workers"`
    SeedPaths      []string     `json:"seedPaths,omitempty"`
}
```

- **dmux integration layer:** Tạo `internal/orchestration/` package cho parallel execution
- **ECC Helper Bridge:** Go-native version của ECC `orchestrate-worktrees.js`
- **Auto-worktree:** Tự động tạo git worktree per worker
- **Status tracking:** Worker status file (`status.md`, `handoff.md`) per worker
- **Fan-in collector:** Gom kết quả từ các workers sau khi hoàn thành

**Implementation Roadmap:**
1. **Phase 1:** Export JSON plan from ANNG CLI → dmux executes
2. **Phase 2:** Go-native worktree orchestration (built-in, no ECC dependency)
3. **Phase 3:** Real-time status monitoring từ TUI (dmux-aware dashboard)
4. **Phase 4:** Integrated fan-in — tự động merge kết quả workers

## 12. Recommendation Matrix

| Use Case | ANNG CLI | Cline | dmux-enhanced ANNG |
|---|---|---|---|
| **Single-file edit** | ✅ Best (fast, TUI) | ✅ | ✅ |
| **Multi-file feature, independent** | ⚠️ Sequential | ✅ Subagents | ✅ dmux panes |
| **Multi-file feature, overlapping** | ⚠️ Sequential + risk | ✅ Subagents + context | ✅ Worktree isolation |
| **Research + Synthesize** | ✅ Fast CLI | ✅ Large context | ✅ Parallel research panes |
| **Security audit** | ⚠️ Manual only | ✅ Built-in scans | ❌ Still limited |
| **Code review pipeline** | ❌ No parallel | ✅ Spawn agents | ✅ dmux cross-panes |
| **Test → Fix loop** | ❌ No auto-retry | ✅ Verification loops | ✅ Watcher + Fixer panes |
| **CI/CD headless** | ✅ Lightweight binary | ⚠️ Node.js heavy | ✅ Same as ANNG |
| **Team-scale orchestration** | ❌ Simulated | ✅ Real DAG | ✅ dmux + worktrees |
| **Browser/Visual testing** | ❌ | ✅ browser-qa | ❌ |
| **Rapid prototyping** | ✅ Fast startup | ✅ Rich tools | ✅ dmux + ANNG |
| **Production deployment** | ✅ Standalone | ⚠️ VS Code dep | ✅ Standalone |

### Decision Flowchart

```
Bạn cần làm gì?
│
├─ Chỉnh sửa 1 file nhanh? → ANNG CLI (TUI mode)
├─ Cần parallel agents?
│   ├─ Có subagent spawning? → Cline (spawn_agent)
│   ├─ Không có Cline? → dmux + ANNG CLI (multi-panes)
│   └─ Cross-harness? → dmux (Claude + Codex + ANNG)
├─ Cần planning system? → Cline (writing-plans)
├─ Cần security scan? → Cline (security-scan)
├─ Cần CI/CD headless? → ANNG CLI (--json flag)
├─ Cần visual testing? → Cline (browser-qa)
└─ Cần TUI đẹp? → ANNG CLI (Bubble Tea)
```

## 13. Kết luận

### Tổng quan

| Hệ thống | Điểm mạnh cốt lõi | Điểm yếu chính | Best for |
|---|---|---|---|
| **ANNG CLI** | Performance, TUI, standalone | No parallelism, few skills | Dev cần CLI nhanh, gọn |
| **Cline** | Subagents, 200+ skills, DAG orchestration | VS Code dep, Node.js heavy | Dev cần full toolset |
| **dmux** | Cross-harness, worktree isolation | External tool, manual setup | Orchestration layer |

### Chiến lược kết hợp

**Strategy 1: ANNG CLI + dmux (Best for Go projects)**
```bash
# dmux orchestrates multiple ANNG CLI agents
# Mỗi pane = 1 ANNG CLI headless session
# Zero VS Code dependency, pure terminal
dmux
# Press 'n' → anng -p "task 1" --yolo
# Press 'n' → anng -p "task 2" --yolo
```

**Strategy 2: Cline standalone (Best for complex features)**
```bash
# Cline spawn_agent + team tools nội tại
# Không cần external orchestration
```

**Strategy 3: Hybrid (Best for maximum flexibility)**
```bash
# dmux quản lý panes
Pane 1: anng -p "research" --yolo              # Nhanh, nhẹ
Pane 2: claude "implement from research"         # Rich context
Pane 3: codex "refactor utilities"               # Codex expertise
```

### Tương lai

ANNG CLI đang ở giai đoạn early-stage so với Cline. Các cơ hội cải tiến lớn nhất:

1. **Subagent system** (Priority 1) — Cần nhất, thay đổi game
2. **dmux-aware orchestration** (Priority 6) — Nhanh nhất, external workaround
3. **Planning system** (Priority 3) — Tận dụng `docs/superpowers/plans/`
4. **Skills expansion** — Kế thừa từ Cline patterns

Với dmux, ANNG CLI có thể **ngay lập tức** bù đắp điểm yếu parallel orchestration mà không cần đợi implement subagent system. Đây là chiến lược "quick win" ngắn hạn.

---

*Plan hoàn tất. Cập nhật lần cuối: 2026-06-25.*  
*Tệp: `docs/superpowers/plans/2026-06-25-anng-vs-cline-comparison.md`*
