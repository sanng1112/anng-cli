# ANNG CLI Configuration

## Resolution Order

At runtime, ANNG CLI resolves configuration in this order:

1. Built-in defaults
2. `~/.anng/settings.json`
3. `./.anng/settings.json`
4. Environment variables

Project settings override user settings. Environment variables override both.

## Settings File Locations

ANNG CLI reads the following files:

- User scope: `~/.anng/settings.json`
- Project scope: `<project root>/.anng/settings.json`

The same `settings.json` file is also used for MCP server definitions.

## Supported Runtime Fields

The current Go runtime supports these top-level fields:

| Field | Type | Description |
| --- | --- | --- |
| `provider` | string | `openai`, `deepseek`, `anthropic`, or `google` |
| `model` | string | Active model identifier |
| `apiKey` | string | API key for OpenAI-compatible providers |
| `baseUrl` | string | Optional API base URL override |
| `geminiApiKey` | string | Gemini API key for the Google provider |
| `geminiBaseUrl` | string | Optional Gemini OpenAI-compatible endpoint override |
| `autoAccept` | boolean | Automatically approve tool permission prompts |
| `planMode` | boolean | Run in planning mode and block mutating tools |
| `thinkingEnabled` | boolean | Enable thinking mode where supported |
| `reasoningEffort` | string | `-`, `none`, `low`, `medium`, `high`, or `max` |
| `models` | string[] | Optional custom model list shown in the TUI |
| `env` | object | Extra environment variables stored with settings |
| `mcpServers` | object | MCP server definitions loaded at startup |

Example:

```json
{
  "provider": "deepseek",
  "model": "deepseek-v4-pro",
  "apiKey": "sk-...",
  "baseUrl": "https://api.deepseek.com",
  "autoAccept": false,
  "planMode": false,
  "thinkingEnabled": true,
  "reasoningEffort": "max",
  "models": ["deepseek-v4-pro", "gpt-4o"]
}
```

## Environment Variables

These environment variables override values from `settings.json`:

| Environment Variable | Field |
| --- | --- |
| `ANNG_PROVIDER` | `provider` |
| `ANNG_MODEL` | `model` |
| `ANNG_API_KEY` | `apiKey` |
| `ANNG_BASE_URL` | `baseUrl` |
| `ANNG_THINKING_ENABLED` | `thinkingEnabled` |
| `ANNG_REASONING_EFFORT` | `reasoningEffort` |
| `GEMINI_API_KEY` | `geminiApiKey` |
| `GEMINI_BASE_URL` | `geminiBaseUrl` |

## Provider Notes

- `provider: "gemini"` is normalized to `google`.
- `thinkingEnabled` defaults to `true` for DeepSeek V4 models.
- If thinking mode is enabled and `reasoningEffort` is empty, the runtime uses `-`.
- `autoAccept` and `planMode` cannot both be enabled at the same time.

## MCP Servers

MCP servers are configured in the same `settings.json` file under `mcpServers`.

Example:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_xxx"
      }
    }
  }
}
```

Supported fields per server:

| Field | Type | Description |
| --- | --- | --- |
| `command` | string | Executable or command to launch |
| `args` | string[] | Arguments passed to the command |
| `env` | object | Environment variables for the MCP process |

MCP servers are loaded when the app starts. Connection failures are surfaced as warnings and shown in the MCP status view.
