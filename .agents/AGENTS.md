# Agent and Contributor Rules for ANNG CLI

## Visual Progress Logging
When you (the agent) execute tasks, plan, or report progress, format your actions and steps using clear bullet-style progress headers matching the visual status format, instead of raw bash/grep commands:
- Use `● Schedule(<Details>)` when waiting or scheduling timers.
- Use `● Search(<Query>)` when searching the codebase or web.
- Use `● Read(<Path>)` when reading or viewing files.
- Use `● Write(<Path>)` when creating or modifying files.
- Use `● Command(<Command>)` when executing a command.

## Plan-First & Todo List Requirement
- Every request/task must begin with a detailed plan formatted as a TODO list (serving as detailed plans to show progress).
- As you complete each step, show the updated progress by marking items as checked (e.g., `[x]` vs `[ ]`).
- Every file or directory referenced must contain clickable absolute file links ("maps") in the format `[filename](file:///absolute/path/to/file)` so the user knows exactly what is being touched and can intervene clearly (or proceed automatically depending on the mode).
- Do not execute actions silently ("skills only"). Always maintain and update this transparent roadmap in your communication.
