<div align="center">
<br/>
<br/>
<p align="center">
  <a href='https://anng.vegamo.cn/'>
    <img src='https://avatars.githubusercontent.com/u/118287711?s=200&v=4' width='100' alt="anng-cli"/>
  </a>
</p>
<h1>ANNG CLI</h1>

[![][github-contributors-shield]][github-contributors-link] [![][github-forks-shield]][github-forks-link] [![][github-stars-shield]][github-stars-link]
[![][github-issues-shield]][github-issues-link] [![][github-issues-pr-shield]][github-issues-pr-link] [![][github-license-shield]][github-license-link]

English · [中文](./README-zh_CN.md) · [Tiếng Việt](./README.md)

<br/>
</div>

[ANNG CLI v0.2.2](https://github.com/lessweb/anng-cli) is a Go-based terminal AI coding assistant with a Bubble Tea TUI, headless execution mode, skills, MCP integration, team orchestration, and file state safety.

## Requirements

- Go `1.24` or newer
- An API key for the provider you want to use

## Build

```bash
go build -o anng ./cmd/anng
```

Or use the `Makefile`:

```bash
make build
```

Run tests:

```bash
make test
```

## Run

Start the interactive TUI:

```bash
./anng
```

Start with an initial prompt:

```bash
./anng -p "Summarize this project"
```

Run a headless task with automatic approval:

```bash
./anng --yolo --max-turns 10 -p "Run the test suite and fix failures"
```

## Configuration

ANNG CLI reads `./.anng/settings.json` first, then falls back to `~/.anng/settings.json`.

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
  "reasoningEffort": "max"
}
```

Supported top-level fields in the current Go runtime:

| Field | Description |
| --- | --- |
| `provider` | `openai`, `deepseek`, `anthropic`, or `google` |
| `model` | Model identifier |
| `apiKey` | API key for OpenAI-compatible providers |
| `baseUrl` | Optional API base URL override |
| `geminiApiKey` | Gemini API key when using the Google provider |
| `geminiBaseUrl` | Optional Gemini endpoint override |
| `autoAccept` | Auto-accept tool permission prompts |
| `planMode` | Run in planning mode and block mutating tools |
| `thinkingEnabled` | Enable thinking mode where supported |
| `reasoningEffort` | One of `-`, `none`, `low`, `medium`, `high`, `max` |
| `models` | Optional custom model list shown in the TUI |
| `env` | Extra environment variables stored alongside settings |

Environment variables:

- `ANNG_PROVIDER`
- `ANNG_MODEL`
- `ANNG_API_KEY`
- `ANNG_BASE_URL`
- `ANNG_THINKING_ENABLED`
- `ANNG_REASONING_EFFORT`
- `GEMINI_API_KEY`
- `GEMINI_BASE_URL`

## Commands

Type `/` in the TUI to open the command menu.

| Command | Action |
| --- | --- |
| `/new` | Start a new conversation |
| `/resume` | Resume a previous session |
| `/continue` | Continue the latest active session |
| `/model` | Switch model and reasoning settings |
| `/settings` | Edit runtime settings |
| `/skills` | Show available skills |
| `/mcp` | Show MCP server status |
| `/undo` | Restore a previous checkpoint |
| `/init` | Create an `AGENTS.md` file |
| `/raw` | Toggle display mode |
| `/team`, `/team-dp`, `/team-wf` | Open team orchestration views |
| `/exit` | Quit the app |

## Basic Controls

| Key | Action |
| --- | --- |
| `Enter` | Send the prompt |
| `Ctrl+J` | Insert a newline |
| `Esc` | Interrupt or go back |
| `Ctrl+C` / `Ctrl+D` | Quit |

## Providers

- `openai`
- `deepseek`
- `anthropic`
- `google`

## Documentation

- [Quickstart](./docs/quickstart_en.md)
- [Configuration](./docs/configuration_en.md)
- [MCP](./docs/mcp_en.md)
- [Agent Skills](./docs/agent-skills_en.md)

## Contributing

```bash
git clone https://github.com/lessweb/anng-cli.git
cd anng-cli
make test
make build
```

## License

MIT

<!-- LINK GROUP -->

[github-contributors-link]: https://github.com/lessweb/anng-cli/graphs/contributors
[github-contributors-shield]: https://img.shields.io/github/contributors/lessweb/anng-cli?color=4d6BFE&labelColor=black&style=flat-square&cacheSeconds=1800
[github-forks-link]: https://github.com/lessweb/anng-cli/network/members
[github-forks-shield]: https://img.shields.io/github/forks/lessweb/anng-cli?color=4d6BFE&labelColor=black&style=flat-square&cacheSeconds=1800
[github-stars-link]: https://github.com/lessweb/anng-cli/network/stargazers
[github-stars-shield]: https://img.shields.io/github/stars/lessweb/anng-cli?color=4d6BFE&labelColor=black&style=flat-square&cacheSeconds=1800
[github-issues-link]: https://github.com/lessweb/anng-cli/issues
[github-issues-shield]: https://img.shields.io/github/issues/lessweb/anng-cli?color=4d6BFE&labelColor=black&style=flat-square&cacheSeconds=1800
[github-issues-pr-link]: https://github.com/lessweb/anng-cli/pulls
[github-issues-pr-shield]: https://img.shields.io/github/issues-pr/lessweb/anng-cli?color=4d6BFE&labelColor=black&style=flat-square&cacheSeconds=1800
[github-license-link]: https://github.com/lessweb/anng-cli/blob/main/LICENSE
[github-license-shield]: https://img.shields.io/github/license/lessweb/anng-cli?color=4d6BFE&labelColor=black&style=flat-square&cacheSeconds=1800
