# Quickstart

ANNG CLI is a Go-based terminal AI coding assistant with a Bubble Tea TUI, headless execution mode, MCP integration, and support for multiple model providers.

## Prerequisites

- Go `1.24` or later
- An API key for the provider you want to use

## Build

Build the binary from the repository root:

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
| ----- | ----------- |
| `provider` | `openai`, `deepseek`, `anthropic`, or `google` |
| `model` | Model identifier |
| `apiKey` | API key for OpenAI-compatible providers |
| `baseUrl` | Optional API base URL override |
| `geminiApiKey` | Gemini API key when using the Google provider |
| `geminiBaseUrl` | Optional Gemini endpoint override |
| `autoAccept` | Auto-accept permission prompts |
| `planMode` | Run in planning mode and block mutating tools |
| `thinkingEnabled` | Enable thinking mode |
| `reasoningEffort` | Provider-specific reasoning hint |

## Start

Run the interactive app in your project directory:

```bash
./anng
```

Start with an initial prompt:

```bash
./anng -p "Summarize this project"
```

Run a headless task:

```bash
./anng --yolo --max-turns 10 -p "Run the tests and fix failures"
```

## Basic Controls

| Action | Key |
| ------ | --- |
| Send message | `Enter` |
| Insert a newline | `Ctrl+J` |
| Interrupt or go back | `Esc` |
| Quit | `Ctrl+C` or `/exit` |

## Slash Commands

Type `/` to open the command menu.

| Command | Action |
| ------- | ------ |
| `/new` | Start a new conversation |
| `/resume` | Choose a previous conversation |
| `/continue` | Continue the latest active conversation |
| `/model` | Switch model and reasoning settings |
| `/init` | Create an `AGENTS.md` file for the current project |
| `/skills` | Show available skills |
| `/mcp` | Show MCP server status and tools |
| `/undo` | Restore code and/or conversation |
| `/raw` | Toggle the display mode |
| `/exit` | Quit ANNG CLI |

## Environment Variables

Environment variables override values from the config file:

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

- Read the full configuration guide: [configuration_en.md](configuration_en.md)
- Write Agent Skills: [agent-skills_en.md](agent-skills_en.md)
- Configure MCP tools: [mcp_en.md](mcp_en.md)
- Add project instructions: [agents-md_en.md](agents-md_en.md)
