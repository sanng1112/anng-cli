# ANNG CLI v0.2.2

<div align="center">
  <p><strong>Trợ lý lập trình AI — Go runtime, TUI (Bubble Tea), headless, MCP, skills</strong></p>
  <p>Tiếng Việt · <a href="./README-en.md">English</a> · <a href="./README-zh_CN.md">中文</a></p>
</div>

ANNG CLI là trợ lý lập trình AI chạy trong terminal, viết bằng Go. Cung cấp TUI tương tác (Bubble Tea), headless mode cho CI/CD, tích hợp MCP, skills system, và team orchestration.

---

## Tính năng chính

| Tính năng | Mô tả |
|---|---|
| **TUI tương tác** | Bubble Tea — chat, settings, session list, MCP status, skills, team |
| **Headless mode** | `--json` cho CI/CD, `--yolo` auto-approve, `--plan` block mutations |
| **Đa provider** | OpenAI, DeepSeek, Anthropic, Google Gemini |
| **MCP** | Stdio transport, JSON-RPC 2.0, auto-reconnect, tool discovery |
| **Skills system** | 6 search paths, YAML frontmatter, override priority |
| **File state safety** | Read-before-write, external modification detection |
| **Session persistence** | JSONL, checkpoint/restore, git integration |
| **Task manager** | Background task lifecycle management |
| **Team orchestration** | Team view, divide-and-conquer, workflow pipeline |
| **Autocomplete** | `@file` mentions, tab completion, slash commands |

---

## Yêu cầu

- **Go 1.24+**
- API key cho provider bạn dùng

## Cài đặt & Build

```bash
# Build binary
go build -o anng ./cmd/anng

# Hoặc dùng Makefile
make build

# Chạy test
make test
```

## Sử dụng

### TUI tương tác (mặc định)

```bash
./anng
```

### Headless với prompt

```bash
./anng -p "Tóm tắt project này"
```

### JSON output cho CI/CD

```bash
./anng --json -p "Run tests và báo cáo"
```

### YOLO mode (auto-approve)

```bash
./anng --yolo -p "Chạy test và sửa lỗi"
```

### Plan mode (chỉ đọc)

```bash
./anng --plan -p "Phân tích kiến trúc"
```

### Giới hạn số turn

```bash
./anng --max-turns 10 -p "10 turns tối đa"
```

## CLI Flags

| Flag | Alias | Mặc định | Mô tả |
|---|---|---|---|
| `--prompt` | `-p` | `""` | Prompt đầu vào (headless mode) |
| `--yolo` | `-y` | `false` | Auto-approve mutations |
| `--plan` | — | `false` | Block mutations, chỉ cho phép đọc |
| `--json` | — | `false` | JSON output cho CI/CD pipelines |
| `--verbose` | `-v` | `false` | Diagnostic logging (stderr) |
| `--max-turns` | — | `50` | Số turn tối đa |
| `--help` | `-h` | — | Hiển thị help |
| `--version` | — | — | Hiển thị phiên bản |

---

## Cấu hình

ANNG đọc settings theo thứ tự ưu tiên:
1. `./.anng/settings.json` (project-level)
2. `~/.anng/settings.json` (user-level)

```json
{
  "provider": "deepseek",
  "model": "deepseek-v4-pro",
  "apiKey": "sk-...",
  "baseUrl": "https://api.deepseek.com",
  "autoAccept": false,
  "planMode": false,
  "thinkingEnabled": true,
  "reasoningEffort": "max"
}
```

| Field | Mô tả |
|---|---|
| `provider` | `openai`, `deepseek`, `anthropic`, `google` |
| `model` | Model identifier |
| `apiKey` | API key cho OpenAI-compatible providers |
| `baseUrl` | Override API base URL |
| `geminiApiKey` | Gemini API key riêng |
| `geminiBaseUrl` | Gemini endpoint override |
| `autoAccept` | Auto-accept tool permissions |
| `planMode` | Block mutating tools |
| `thinkingEnabled` | Enable thinking/reasoning mode |
| `reasoningEffort` | `-`, `none`, `low`, `medium`, `high`, `max` |
| `models` | Custom model list cho TUI dropdown |
| `activeSkills` | Danh sách skills được bật |
| `mcpServers` | MCP server definitions |

### Environment Variables

| Variable | Ghi đè field |
|---|---|
| `ANNG_PROVIDER` | `provider` |
| `ANNG_MODEL` | `model` |
| `ANNG_API_KEY` | `apiKey` |
| `ANNG_BASE_URL` | `baseUrl` |
| `ANNG_THINKING_ENABLED` | `thinkingEnabled` |
| `ANNG_REASONING_EFFORT` | `reasoningEffort` |
| `GEMINI_API_KEY` | `geminiApiKey` |
| `GEMINI_BASE_URL` | `geminiBaseUrl` |

---

## Slash Commands

### Lệnh hệ thống

| Command | Mô tả |
|---|---|
| `/exit` | Thoát session |
| `/new` | New conversation |
| `/resume` | Resume session từ file |
| `/continue` | Tiếp tục generation |
| `/undo` | Undo last turn |
| `/mcp` | MCP server status |
| `/settings` | Settings UI |
| `/model` | Chọn model |
| `/skills` | List/enable skills |
| `/raw` | Raw prompt mode |
| `/init` | Tạo AGENTS.md |

### Lệnh skills

| Command | Mô tả |
|---|---|
| `/team` | Team orchestration view |
| `/team-dp` | Divide-and-conquer agents |
| `/team-wf` | Workflow pipeline |
| `/custom-agents` | Custom agent config |

---

## TUI Controls

| Key | Action |
|---|---|
| `Enter` | Gửi prompt |
| `Tab` | Autocomplete slash command |
| `Ctrl+J` | Xuống dòng |
| `Esc` | Clear input / quay lại |
| `/` | Mở slash-commands menu |
| `Ctrl+C` / `Ctrl+D` | Thoát |

---

## Providers

| Provider | Model gợi ý | Thinking support |
|---|---|---|
| **OpenAI** | `gpt-4o`, `o3-mini` | ✅ |
| **DeepSeek** | `deepseek-v4-pro`, `deepseek-chat` | ✅ (V4 models) |
| **Anthropic** | `claude-3-opus`, `claude-3-sonnet` | ❌ |
| **Google** | `gemini-2.5-pro` | ✅ |

---

## Tools (11+)

ANNG CLI cung cấp 11 tools built-in + dynamic MCP tools:

| Tool | File | Mutating |
|---|---|---|
| `bash` | `bash.go` | ✅ |
| `read_file` | `read.go` | ❌ |
| `write_to_file` | `write.go` | ✅ |
| `replace_file_content` | `edit.go` | ✅ |
| `multi_replace_file_content` | `file.go` | ✅ |
| `ask_question` | `ask_user_question.go` | ❌ |
| `UpdatePlan` | `update_plan.go` | ❌ |
| `search_web` | `search.go` / `web_search.go` | ❌ |
| `HttpRequest` | `http_request.go` | ❌ |
| `AnalyzeProject` | `analyze_project.go` | ❌ |
| `mcp__*` | MCP dynamic | varies |

---

## Kiến trúc

```
cmd/anng/main.go          # Entry point — CLI flags, config, run
├── internal/
│   ├── agent/             # Orchestrator, headless, policy, prompt engine, provider
│   ├── config/            # Settings loading (JSON + env overrides)
│   ├── contextkeys/       # Context key definitions
│   ├── domain/            # Domain models (session)
│   ├── mcp/               # MCP client, transport, manager, tools
│   ├── session/           # Session persistence (JSONL)
│   ├── skills/            # Skill discovery (6 search paths)
│   ├── tokenizer/         # Context compaction (character-based heuristic)
│   ├── tools/             # Tool handlers + executor + file state + task manager
│   └── tui/               # Bubble Tea views (chat, settings, team, MCP, ...)
```

---

## Tài liệu liên quan

- [Quickstart](./docs/quickstart.md)
- [Configuration](./docs/configuration.md)
- [MCP Integration](./docs/mcp.md)
- [Agent Skills](./docs/agent-skills.md)
- [AGENTS.md](./.anng/AGENTS.md)

---

## License

MIT
