# Quick Start

ANNG CLI is a Go-based terminal AI coding assistant with TUI, headless execution, MCP integration, and multi-provider model support.

## Prerequisites

- Go `1.24` or newer
- An API key for your chosen provider

## Build

From the repository root:

```bash
go build -o anng ./cmd/anng
```

Check the version:

```bash
./anng --version
```

## Configure

Create `~/.anng/settings.json` or `./.anng/settings.json`:

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

Common fields:

| Field | Description |
| ---- | ---- |
| `provider` | `openai`, `deepseek`, `anthropic`, or `google` |
| `model` | Model identifier to call |
| `apiKey` | API key for OpenAI-compatible providers |
| `baseUrl` | Optional custom base URL |
| `geminiApiKey` | Gemini API key when using `provider: "google"` |
| `geminiBaseUrl` | Optional Gemini OpenAI-compatible endpoint override |
| `autoAccept` | Auto-accept tool permission prompts |
| `planMode` | Chạy planning mode và chặn các tool có tính thay đổi |
| `thinkingEnabled` | Enable model thinking mode where supported |
| `reasoningEffort` | Reasoning strength hint |

## Launch

Interactive mode:

```bash
./anng
```

Start with an initial prompt:

```bash
./anng -p "write a function to sort an array"
```

Headless mode with auto-accept:

```bash
./anng --yolo --max-turns 10 -p "run the test suite and fix failures"
```

## Common Commands

| Command | Description |
| --- | --- |
| `/model` | Switch model, provider behavior, and reasoning settings |
| `/new` | Start a new session |
| `/resume` | Resume a previous session |
| `/continue` | Continue the latest active session |
| `/undo` | Undo code changes or conversation |
| `/init` | Initialize `AGENTS.md` |
| `/mcp` | View MCP server status |
| `/skills` | List available skills |
| `/raw` | Toggle raw/rendered display mode |
| `/exit` | Exit the app |

## Environment Variables

Environment variables override config file values:

| Environment Variable | Corresponding Field |
| --- | --- |
| `ANNG_PROVIDER` | `provider` |
| `ANNG_MODEL` | `model` |
| `ANNG_API_KEY` | `apiKey` |
| `ANNG_BASE_URL` | `baseUrl` |
| `ANNG_THINKING_ENABLED` | `thinkingEnabled` |
| `ANNG_REASONING_EFFORT` | `reasoningEffort` |
| `GEMINI_API_KEY` | `geminiApiKey` |
| `GEMINI_BASE_URL` | `geminiBaseUrl` |

## Next Steps

- [Configuration Details](./configuration.md)
- [Skills System](./agent-skills.md)
- [MCP Integration](./mcp.md)
- [AGENTS.md](./agents-md.md)
