# Quick Start

ANNG CLI is an open-source terminal AI coding assistant optimized for DeepSeek-V4 models, with support for deep thinking, reasoning effort control, and extensibility via Skills and MCP.

## Prerequisites

Before using, ensure your system has:

- Node.js `22` or higher
- A valid DeepSeek API Key

## Installation

Install globally via npm:

```bash
npm install -g anng-cli
```

Verify installation:

```bash
anng --version
```

## Configure DeepSeek-V4

ANNG CLI recommends `deepseek-v4-pro` and also supports `deepseek-v4-flash`. Create `~/.anng/settings.json` with your DeepSeek model configuration:

```json
{
  "env": {
    "MODEL": "deepseek-v4-pro",
    "BASE_URL": "https://api.deepseek.com",
    "API_KEY": "sk-..."
  },
  "thinkingEnabled": true,
  "reasoningEffort": "max"
}
```

Replace `API_KEY` with your DeepSeek API Key.

Common fields:

| Field | Description |
| ---- | ---- |
| `env.MODEL` | DeepSeek model name, recommended `deepseek-v4-pro` |
| `env.BASE_URL` | DeepSeek API URL, default `https://api.deepseek.com` |
| `env.API_KEY` | DeepSeek API Key |
| `env.TEMPERATURE` | Sampling temperature, classic value `0.1`. Leave empty for default |
| `thinkingEnabled` | Enable deep thinking (`true`/`false`) |
| `reasoningEffort` | Reasoning effort: `"high"` or `"max"` |

## Launch

Navigate to your project directory and run:

```bash
anng
```

No arguments for interactive mode, use `-p` to submit a prompt directly:

```bash
anng -p "write a function to sort an array"
```

For headless/CI mode with auto-accept:

```bash
anng --yolo --max-turns 10 -p "fix the bug in src/index.ts"
```

## Common Commands

| Command | Description |
| --- | --- |
| `/model` | Switch model (including thinking mode and reasoning effort) |
| `/new` | Start a new session |
| `/resume` | Resume a previous session |
| `/undo` | Undo code changes or conversation |
| `/init` | Initialize AGENTS.md |
| `/mcp` | View MCP server status |
| `/raw` | Toggle raw/rendered display mode |
| `/exit` or `Ctrl+D` twice | Exit |

## Next Steps

- [Configuration Details](./configuration.md) — Learn all configuration options
- [Skills System](./agent-skills.md) — Create custom skills
- [MCP Integration](./mcp.md) — Connect external tool servers
- [Permission System](./permission.md) — Control tool call permissions
- [AGENTS.md](./agents-md.md) — Write AI instructions for your project
- [Notification System](./notify.md) — Task completion notifications
- [Session Persistence](./session-persistence.md) — Session storage and recovery

## Environment Variables

All `env.*` fields in `settings.json` can also be set via environment variables, which take higher priority.

| Environment Variable | Corresponding Field |
| --- | --- |
| `DEEPCODE_MODEL` | `env.MODEL` |
| `DEEPCODE_BASE_URL` | `env.BASE_URL` |
| `DEEPCODE_API_KEY` | `env.API_KEY` |
| `DEEPCODE_TEMPERATURE` | `env.TEMPERATURE` |
| `DEEPCODE_THINKING_ENABLED` | `thinkingEnabled` |
| `DEEPCODE_REASONING_EFFORT` | `reasoningEffort` |

## Headless Mode (CI/CD)

Use `--yolo` to auto-accept all tool permissions without prompting. Combine with `--max-turns` to limit conversations:

```bash
anng --yolo --max-turns 10 -p "run the test suite and fix failures"
```

`--yolo` skips all permission prompts (bash commands, file writes, network access). Use with caution in production environments.
