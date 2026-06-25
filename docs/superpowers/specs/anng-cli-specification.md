# ANNG CLI v0.2.2 — Đặc tả kiến trúc toàn diện

> **Phiên bản:** 0.2.2 | **Module:** `anng-cli` | **Go:** 1.24 | **License:** MIT
> **Author:** sanng1112

---

## 1. Tổng quan

ANNG CLI là trợ lý lập trình AI chạy trong terminal, viết bằng Go. Sử dụng Bubble Tea cho TUI, hỗ trợ đa provider (OpenAI, DeepSeek, Anthropic, Google), tích hợp MCP, skills system, team orchestration, và section-based prompt caching.

### 1.1 Kiến trúc tổng thể

```
User Input (terminal)
    │
    ▼
┌──────────────────────────────────────────────────────┐
│                  Bubble Tea TUI                      │
│  ┌─────────┐ ┌──────────┐ ┌────────┐ ┌──────────┐  │
│  │ Chat     │ │ Settings │ │ Skills │ │ MCP      │  │
│  │ View     │ │ Overlay  │ │ List   │ │ Status   │  │
│  └────┬────┘ └──────────┘ └────────┘ └──────────┘  │
└───────┼──────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────┐
│              Agent Orchestrator                      │
│  ┌──────────┐ ┌──────────┐ ┌─────────────────────┐  │
│  │ Prompt   │→│ LLM API  │→│ Tool Execution      │  │
│  │ Engine   │ │ Call     │ │ Loop                │  │
│  └──────────┘ └──────────┘ └─────────────────────┘  │
│        │                                              │
│  ┌─────┴──────┐ ┌──────────┐ ┌──────────────────┐   │
│  │ Section    │ │ Read Log │ │ Context           │   │
│  │ Cache      │ │ (Agent)  │ │ Compactor (325K)  │   │
│  └────────────┘ └──────────┘ └──────────────────┘   │
└──────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────┐
│              Tool Layer (11 tools + MCP)             │
│  bash │ read │ write │ edit │ multi_edit │ ask      │
│  UpdatePlan │ search_web │ HttpRequest │ Analyze    │
│  mcp__* (dynamic)                                    │
└──────────────────────────────────────────────────────┘
```

---

## 2. Package Map

```
cmd/anng/
├── main.go          # Entry point — CLI flags, config, run
└── main_test.go

internal/
├── agent/           # Agent loop, orchestration, policy, providers
│   ├── orchestrator.go       # Agent loop — system prompt, LLM calls, tool exec
│   ├── headless.go            # Headless mode (CI/CD, --json, --yolo)
│   ├── policy.go              # Policy engine (plan/yolo/normal mode)
│   ├── prompt_engine.go       # System prompt builder + skill injection
│   ├── provider.go            # Provider resolution + threshold config
│   ├── execution_context.go   # Execution context types
│   ├── tool_specs.go          # Tool definition specs for LLM
│   └── *_test.go              # Test files
│
├── config/          # Settings management
│   └── config.go              # JSON loading, env overrides, lock, validation
│
├── contextkeys/     # Context key definitions
│   └── keys.go                # SessionIDKey, ProjectRootKey
│
├── domain/          # Domain models
│   ├── session.go             # Session model
│   └── session_test.go
│
├── mcp/             # MCP Protocol (JSON-RPC 2.0)
│   ├── client.go              # MCP client — init, listTools, callTool
│   ├── config.go              # Server config loader
│   ├── manager.go             # Connection lifecycle, auto-reconnect
│   ├── tools.go               # Tool conversion + namespace parser
│   ├── transport.go           # Stdio transport
│   └── *_test.go
│
├── section/         # Section caching system (v0.2.2)
│   ├── store.go               # Section CRUD at ~/.anng/section/
│   └── log.go                 # Read log with agent tracking + lock
│
├── session/         # Session persistence
│   └── store.go               # JSONL persistence, checkpoint/restore
│
├── skills/          # Skill discovery
│   ├── skills.go              # 6 search paths, YAML frontmatter
│   ├── expand.go              # Skill content expansion
│   └── *_test.go
│
├── tokenizer/       # Context compaction
│   ├── compacter.go           # Character-based heuristic, threshold logic
│   └── compacter_test.go
│
├── tools/           # Tool handlers
│   ├── executor.go            # ToolRegistry — dispatch
│   ├── bash.go                # PTY execution
│   ├── read.go                # File reading
│   ├── write.go               # Read-before-write enforcement
│   ├── edit.go                # Single replace
│   ├── file.go                # Multi-replace (bottom-up sorted)
│   ├── ask_user_question.go   # User interaction
│   ├── update_plan.go         # Plan recording
│   ├── web_search.go          # Web search API
│   ├── search.go              # Search tool
│   ├── http_request.go        # HTTP client
│   ├── analyze_project.go     # AST + directory walk
│   ├── state.go               # File state tracking (LRU)
│   ├── task_manager.go        # Background task lifecycle
│   ├── paths.go               # Path utilities
│   └── *_test.go              # Test files
│
└── tui/             # Bubble Tea UI
    ├── app.go                 # App model, overlay routing
    ├── chat_view.go           # Main chat input/output
    ├── settings_view.go       # Settings overlay (category tabs, submenus)
    ├── dropdown_menu.go       # Reusable dropdown
    ├── input_buffer.go        # Input buffer with history
    ├── autocomplete.go        # @file mentions + tab completion
    ├── file_mentions.go       # Project file scanning
    ├── list_views.go          # Session list, skills list
    ├── model_skills_views.go  # Model/Skills selection
    ├── permission_prompt_view.go  # Permission prompts
    ├── team_view.go           # Team orchestration
    ├── process_view.go        # Process output viewer
    ├── mascot.go              # Terminal mascot
    ├── views.go               # View routing (state machine)
    ├── prompts.go             # TUI prompt helpers
    ├── welcome.go             # Welcome screen
    ├── theme.go               # Color theme
    └── *_test.go
```

---

## 3. CLI Interface

### 3.1 Flags

| Flag | Alias | Default | Description |
|---|---|---|---|
| `--prompt` | `-p` | `""` | Prompt input (headless mode) |
| `--yolo` | `-y` | `false` | Auto-approve mutations |
| `--plan` | — | `false` | Block mutations, read-only |
| `--json` | — | `false` | JSON output for CI/CD |
| `--verbose` | `-v` | `false` | Diagnostic logging (stderr) |
| `--max-turns` | — | `50` | Max agent turns |
| `--help` | `-h` | — | Help text |
| `--version` | — | — | Version info |

### 3.2 Run Modes

| Mode | Command | Use Case |
|---|---|---|
| **TUI** (default) | `./anng` | Interactive coding |
| **Headless** | `./anng -p "prompt"` | Quick tasks |
| **CI/CD** | `./anng --json -p "prompt" --yolo` | Automated pipelines |
| **Plan** | `./anng --plan -p "prompt"` | Research, architecture |
| **YOLO** | `./anng --yolo -p "prompt"` | Auto-approve all |

### 3.3 Slash Commands

**System commands:**

| Command | Description |
|---|---|
| `/exit` | Thoát session |
| `/new` | New conversation |
| `/resume` | Resume session from file |
| `/continue` | Continue generation |
| `/undo` | Undo last turn |
| `/mcp` | MCP server status |
| `/settings` | Settings overlay |
| `/model` | Select model |
| `/skills` | List/enable skills |
| `/raw` | Raw prompt mode |
| `/init` | Create AGENTS.md |
| `/team` | Team orchestration |
| `/team-dp` | Data-parallel agents |
| `/team-wf` | Workflow pipeline |
| `/custom-agents` | Custom agent config |

### 3.4 TUI Controls

| Key | Action |
|---|---|
| `Enter` | Send prompt |
| `Tab` | Autocomplete slash command |
| `Ctrl+J` | Newline |
| `Esc` | Clear input / go back |
| `/` | Open slash-commands menu |
| `Ctrl+C` / `Ctrl+D` | Quit |

---

## 4. Architecture Components

### 4.1 Agent Loop (`internal/agent/orchestrator.go`)

```go
for turn < maxTurns {
    // 1. Section caching (every 3 turns)
    // 2. Inject cached sections with <prompt_caching> markers
    // 3. Context compaction check (threshold: 325K tokens)
    // 4. Build tool specs + MCP tools
    // 5. API call (synchronous)
    // 6. Parse response
    // 7. Execute tool calls sequentially
    // 8. Append results to message history
}
```

**Key characteristics:**
- Synchronous turn-based (không parallel tool calls)
- Max turns: 50 (default)
- Context compaction at 75% threshold
- Section caching injects cached history with `<prompt_caching>` markers

### 4.2 Config System (`internal/config/config.go`)

**Settings fields (22 fields):**

```go
type Settings struct {
    // Provider
    Model, ApiKey, BaseURL, Provider, GeminiApiKey, GeminiBaseURL string

    // Generation
    MaxTokens int, Temperature float64, ThinkingEnabled bool
    ReasoningEffort string, RequestTimeout int

    // Behavior
    AutoAccept, PlanMode bool, CustomInstructions string
    ActiveSkills []string

    // Context
    ContextBudget int, ContextCompaction string

    // UI
    Theme string, Language string

    // Security
    AllowedTools, BlockedTools []string

    // Storage
    Env map[string]string, Models []string
}
```

**Load priority:**
1. `./.anng/settings.json` (project-level)
2. `~/.anng/settings.json` (user-level)
3. Environment variables (`ANNG_*`)

**Concurrency protection:**
- File lock `~/.anng/.settings.lock`
- Retry 50 times × 10ms = 500ms timeout

### 4.3 Policy Engine (`internal/agent/policy.go`)

```go
var mutatingTools = map[string]bool{
    "bash": true, "write_to_file": true,
    "replace_file_content": true, "multi_replace_file_content": true,
}
```

| Mode | Behavior |
|---|---|
| **Normal** | Mutating tools → user confirmation prompt |
| **Plan** (`--plan`) | All mutating tools BLOCKED |
| **YOLO** (`--yolo`) | All mutations auto-approved |

### 4.4 File State Tracking (`internal/tools/state.go`)

```go
// Session-aware file state with LRU eviction (max 100 sessions)
var fileStates = map[string]map[string]FileState{}
```

**Rules:**
- Read-before-write enforcement
- External modification detection
- Session isolation per UUID
- LRU eviction at 100 sessions

---

## 5. Tools (11 + MCP dynamic)

| # | Tool | File | Mutating | Description |
|---|---|---|---|---|
| 1 | `bash` | `bash.go` | ✅ | PTY shell execution (30s timeout, 10K line cap) |
| 2 | `read_file` | `read.go` | ❌ | Read file with line numbers |
| 3 | `write_to_file` | `write.go` | ✅ | Read-before-write enforced |
| 4 | `replace_file_content` | `edit.go` | ✅ | Single string replace |
| 5 | `multi_replace_file_content` | `file.go` | ✅ | Bottom-up sorted multi-replace |
| 6 | `ask_question` | `ask_user_question.go` | ❌ | Interactive prompts |
| 7 | `UpdatePlan` | `update_plan.go` | ❌ | Plan recording |
| 8 | `search_web` | `web_search.go` | ❌ | Web search API |
| 9 | `HttpRequest` | `http_request.go` | ❌ | HTTP client |
| 10 | `AnalyzeProject` | `analyze_project.go` | ❌ | AST + dir walk |
| 11+ | `mcp__*` | MCP dynamic | varies | Namespaced MCP tools |

### 5.1 Tool Execution Flow

```
Agent generates tool_call JSON
  → ToolRegistry.Lookup(name)
    → [Policy check] (plan blocks mutating)
      → [Permission prompt] (if mutating & !yolo)
        → Execute handler
          → Return result/error string
```

---

## 6. MCP Protocol (`internal/mcp/`)

### 6.1 Architecture

- **Transport:** Stdio (JSON-RPC 2.0 over stdin/stdout)
- **Spec version:** 2024-11-05
- **Tool namespacing:** `mcp__<server>__<tool>`

### 6.2 State Machine

```
disconnected → [connect] → connecting → [success] → connected
                                            → [error] → error → [30s retry]
```

### 6.3 Auto-reconnect

- Loop every 30s
- Exponential backoff: 2s, 4s, 8s, 16s, 32s (max 5 retries)

---

## 7. Skills System (`internal/skills/`)

### 7.1 Search Paths (ordered by priority)

```
1. ~/.gemini/antigravity-cli/builtin/skills/   (built-in, lowest)
2. ~/.gemini/config/skills/                       (legacy)
3. ~/.anng/skills/                                (user global)
4. ~/.agents/skills/                              (shared agents)
5. <project>/.anng/skills/                        (project-specific)
6. <project>/.agents/skills/                      (project agents)
```

Path cuối cùng → ghi đè path đầu tiên.

### 7.2 Skill Format (SKILL.md)

```markdown
---
name: skill-name
description: What this skill does
version: 1.0.0
tags: [go, analysis]
enabled: true
---
# Content
```

---

## 8. Section Caching System (mới v0.2.2)

### 8.1 Section Store (`~/.anng/section/<id>.json`)

```go
type Section struct {
    ID        string    // sha256(content+timestamp)[:8]
    SessionID string
    CreatedAt time.Time
    TokenCost int
    Content   string    // conversation segment
    Role      string
    Tags      []string  // ["auto", "turn_N"]
}
```

- Mỗi 3 turns, auto-save section từ 6 messages gần nhất
- Section ID unique: `sha256(content + time.Now().String())[:8]`

### 8.2 Read Log (`~/.anng/section/_readlog_<sessionID>.json`)

```go
type ReadLogEntry struct {
    SectionID string    // section reference
    AgentID   string    // "main", "reviewer", "fixer", ...
    ReadAt    time.Time
    Role      string
    Length    int
    CacheKey  string    // sec_<session>_<section>_<agent>
}
```

### 8.3 Concurrency Protection

| Cơ chế | Mô tả |
|---|---|
| `sync.Mutex` | Lock in-process giữa goroutines |
| `atomicWrite()` | Temp file + atomic rename |
| `cacheKeyFor()` | Agent-specific cache key isolation |

### 8.4 Prompt Caching Markers

```xml
<prompt_caching>
<cache key="sec_a1b2c3_d4e5f6_main">
[user]: implement auth middleware...
[assistant]: here's the code...
</cache>
</prompt_caching>
<active_context>
Current conversation turn...
</active_context>
```

### 8.5 Compression Threshold (325K tokens)

| Model | Old Threshold | New Threshold |
|---|---|---|
| deepseek-v4* | 48K | **325K** |
| gpt-4/o1/o3 | 32K | **325K** |
| claude-3/4 | 32K | **325K** |
| gemini-2.5* | 128K | **325K** |
| gemini-3.1-pro | 500K | 500K (giữ) |
| default | 32K | **128K** |

---

## 9. Settings Overlay (TUI)

### 9.1 Navigation

| Key | Action |
|---|---|
| `←` / `→` | Switch category (Prov / Gen / Behav / Ctx / UI / Sec) |
| `↑` / `↓` | Select item |
| `Enter` | Edit / toggle |
| `Esc` | Close overlay |
| Type letters | Search mode |

### 9.2 Interaction Types

| Type | Settings | Behavior |
|---|---|---|
| **Toggle** | scope, thinking, auto_accept, plan_mode | Enter toggles immediately |
| **Submenu** | provider, reasoning, theme, language, compaction | Show selectable list |
| **Numeric** | temperature, maxTokens, timeout, context_budget | Show preset values |
| **List** | active_skills, allowed_tools, blocked_tools | Add/remove items |
| **Model** | model | Model list + "Add custom" |
| **Text** | apiKey, baseURL, custom_instructions | Free text input |

---

## 10. Provider Support

| Provider | Models | Thinking | Auth |
|---|---|---|---|
| **OpenAI** | gpt-4o, o1, o3-mini | ✅ | `apiKey` |
| **DeepSeek** | deepseek-v4-pro, deepseek-chat | ✅ (V4) | `apiKey` |
| **Anthropic** | claude-3-opus, claude-3-sonnet | ❌ | `apiKey` |
| **Google** | gemini-2.5-pro, gemini-3.1-pro | ✅ | `geminiApiKey` |

---

## 11. Storage Layout (`~/.anng/`)

```
~/.anng/
├── settings.json           # User-level config
├── .settings.lock           # Concurrent write lock
├── section/                 # Section caching (v0.2.2)
│   ├── a1b2c3d4.json        # Section data
│   ├── e5f6g7h8.json
│   └── _readlog_<uuid>.json # Read log (per session)
├── projects/
│   └── <sha256[:16]>/       # Per-project session storage
│       ├── <session>.jsonl  # Session messages (JSONL)
│       ├── <session>.json
│       └── .checkpoints/    # Git-style checkpoints
├── skills/                  # User skills
├── models.json              # Custom model registry
├── providers.json           # Provider configurations
├── machine-id               # Machine identity
├── logs/
├── audit/
├── keys/
└── teams/
```

---

## 12. Session Persistence (`internal/session/store.go`)

**Format:** JSONL (1 JSON object per line)

```jsonl
{"role":"system","content":"You are ANNG CLI...","createTime":"..."}
{"role":"user","content":"Implement auth","createTime":"..."}
{"role":"assistant","content":"Here's the code...","createTime":"..."}
```

**Features:**
- Checkpoint/restore via `.checkpoints/` directory
- `/undo` rollback to previous checkpoint
- LRU eviction: max 100 sessions

---

## 13. Testing Strategy

| Package | Test Count | Coverage |
|---|---|---|
| `agent/` | ~100 tests | 70%+ |
| `tools/` | ~80 tests | 65%+ |
| `tui/` | ~60 tests | 50%+ |
| `config/` | ~20 tests | 80%+ |
| `mcp/` | ~30 tests | 60%+ |
| `session/` | ~10 tests | 70%+ |
| `skills/` | ~10 tests | 60%+ |
| `tokenizer/` | ~10 tests | 80%+ |
| `section/` | — | (new) |

**Patterns:**
- Table-driven tests (Go style)
- Mock clients (fake OpenAI)
- MCP E2E mock server
- Temp directory isolation for file tests
- PTY mock for bash tool tests

---

## 14. Build & Dev Commands

```bash
# Build
make build          # go build -o anng ./cmd/anng

# Test
make test           # go test ./...
make verify         # test + build

# Format
make clean          # rm -f anng
go fmt ./...        # Format code
go vet ./...        # Static analysis
```

---

## 15. Dependencies

| Package | Purpose |
|---|---|
| `bubbletea` | TUI framework |
| `lipgloss` | Terminal styling |
| `go-openai` | OpenAI API client |
| `creack/pty` | PTY for bash tool |

Tổng cộng ~20 indirect dependencies. Binary size: ~12MB.

---

## 16. Environment Variables

| Variable | Overrides |
|---|---|
| `ANNG_MODEL` | `settings.model` |
| `ANNG_API_KEY` | `settings.apiKey` |
| `ANNG_BASE_URL` | `settings.baseUrl` |
| `ANNG_PROVIDER` | `settings.provider` |
| `ANNG_THINKING_ENABLED` | `settings.thinkingEnabled` |
| `ANNG_REASONING_EFFORT` | `settings.reasoningEffort` |
| `GEMINI_API_KEY` | `settings.geminiApiKey` |
| `GEMINI_BASE_URL` | `settings.geminiBaseUrl` |
| `ANNG_TEST` | Mock mode ("true" = bypass API) |
| `ANNG_VERBOSE` | Diagnostic output |

---

## 17. Concurrent Safety Matrix

| Component | Mechanism | Protects Against |
|---|---|---|
| Settings write | `.settings.lock` file | 2 ANNG instances |
| Read log Append | `sync.Mutex` + `atomicWrite` | Race condition |
| Section ID | `sha256(content+timestamp)[:8]` | ID collision |
| Cache key | `sec_<session>_<section>_<agent>` | Cross-agent pollution |
| Session dir | `sha256(projectRoot)[:16]` | Project collision |
| File state | Per-session `map[string]FileState` | Cross-session overwrite |
| MCP tools | Per-connection namespace | Server instance conflict |

---

*Hoàn tất. Cập nhật lần cuối: 2026-06-25.*
*Tệp: `docs/superpowers/specs/anng-cli-specification.md`*
