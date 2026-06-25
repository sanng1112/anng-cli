# ANNG CLI Permission Behavior

This document describes the permission behavior that is actually implemented in the current Go runtime.

## Current Modes

ANNG CLI currently supports three practical modes:

1. Default interactive mode
2. `autoAccept`
3. `planMode`

You can configure `autoAccept` and `planMode` in `settings.json`, or use `--yolo` on the CLI to force automatic approval for the current run.

## Default Interactive Mode

When both `autoAccept` and `planMode` are `false`, the TUI shows an approval prompt before executing shell commands triggered through the `bash` tool.

Current behavior:

- Shell commands can prompt for approval in the TUI
- The approval is per command execution
- There is no persisted allow/deny ruleset in `settings.json`

## `autoAccept`

When `autoAccept` is `true`, shell command approvals are skipped.

Example:

```json
{
  "autoAccept": true
}
```

Or from the CLI:

```bash
./anng --yolo -p "run the tests and fix failures"
```

## `planMode`

When `planMode` is `true`, ANNG CLI keeps the agent in a planning-oriented mode and blocks mutating tools at runtime.

The current Go runtime blocks these tools in plan mode:

- `bash`
- `write_to_file`
- `replace_file_content`
- `multi_replace_file_content`

Read-only tools such as file reads remain allowed.

Example:

```json
{
  "planMode": true
}
```

## Important Limitation

The current Go runtime does **not** implement the old scope-based `permissions` configuration model documented by earlier versions.

This means the following are **not** currently supported:

- `permissions.allow`
- `permissions.deny`
- `permissions.ask`
- `permissions.defaultMode`
- persisted per-scope decisions

If you add those fields to `settings.json`, the current Go runtime will ignore them.
