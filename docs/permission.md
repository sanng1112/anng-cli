# Permission System

Deep Code uses a scope-based permission system to control tool execution.

## Configuration

In `settings.json`:

```json
{
  "permissions": {
    "allow": ["read-in-cwd"],
    "deny": ["network"],
    "ask": ["write-in-cwd"],
    "defaultMode": "askAll"
  }
}
```

## Scopes

| Scope | Description |
| --- | --- |
| `read-in-cwd` | Read files in project root |
| `read-out-cwd` | Read files outside project root |
| `write-in-cwd` | Write files in project root |
| `write-out-cwd` | Write files outside project root |
| `network` | Network access (web search, MCP) |
| `bash` | Execute shell commands |

## Modes

- `askAll`: Prompt user for all unscoped decisions (default)
- `allowAll`: Allow all by default
- `denyAll`: Deny all by default

## YOLO Mode

`--yolo` bypasses all permission prompts for automated CI/CD:

```bash
deepcode --yolo -p "fix lint errors"
```
