# Task Completion Notifications

The current Go runtime of ANNG CLI does **not** implement the legacy `notify` setting.

## Current Status

At the moment:

- `notify` is not part of the supported runtime configuration
- ANNG CLI does not execute a notification script after a task finishes
- adding `notify` to `settings.json` has no effect in the current Go runtime

## Recommended Workaround

If you want a notification today, wrap ANNG CLI in your own shell script.

Example:

```bash
#!/usr/bin/env bash
set -euo pipefail

./anng --yolo -p "run the tests and summarize the result"

notify-send "ANNG CLI" "Task finished"
```

You can replace `notify-send` with any other mechanism such as:

- Slack webhook
- macOS `osascript`
- Windows PowerShell toast notifications
- terminal bell / OSC notification

When native notification support is added to the Go runtime, this document should be updated to describe the real implementation.
