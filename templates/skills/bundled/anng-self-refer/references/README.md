# ANNG CLI CLI Reference

[English](README-en.md)

ANNG CLI is a terminal AI coding assistant optimized for `deepseek-v4` models, with deep thinking, reasoning effort control, Agent Skills, and MCP integration.

## Installation

```bash
npm install -g anng-cli
```

Run `anng` in any project directory to start.

## Configuration

Create `~/.anng/settings.json`:

```json
{
  "env": {
    "MODEL": "deepseek-v4-pro",
    "BASE_URL": "https://api.deepseek.com",
    "API_KEY": "sk-..."
  }
}
```

The config file is shared with the ANNG CLI VSCode extension. See [configuration.md](configuration.md) for full options.

## Key Features

- Agent Skills: Extend assistant capabilities
- MCP Servers: External tool integration
- Session Persistence: Resume across restarts
- Permission System: Fine-grained tool control
- Notifications: Desktop alerts on completion

## Reference Documents

- [Configuration](configuration.md)
- [MCP Integration](mcp.md)
- [Permission System](permission.md)
- [Session Persistence](session-persistence.md)
- [Notification System](notify.md)
