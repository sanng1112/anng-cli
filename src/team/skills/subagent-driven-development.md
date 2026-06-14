---
name: subagent-driven-development
description: Break complex development tasks into parallel sub-tasks executed by multiple AI agents simultaneously. Use for multi-file refactors, feature implementation across services, or any task with independent work units that can run concurrently.
metadata:
  allow-implicit-invocation: false
---

# Subagent-Driven Development

Execute development tasks by decomposing them into parallel sub-tasks that multiple AI agents can work on simultaneously.

## When to use

- Use when the task spans 3+ independent files or modules
- Use when you need to implement a feature across backend + frontend simultaneously
- Use when running a large refactor with predictable changes
- Do not use for tightly-coupled changes where order matters
- Do not use for tasks smaller than ~5 tool calls total

## Workflow

1. **Identify** independent work units in the task
2. **Define** sub-tasks with clear boundaries and expected outputs
3. **Detect** file conflicts — if two sub-tasks touch the same file, sequence them
4. **Dispatch** sub-tasks to worker agents
5. **Collect** results and verify each sub-task completed successfully
6. **Integrate** — if any sub-task failed, report and suggest manual intervention

## Sub-Task Definition

Each sub-task must have:
- Clear description of what to build/change
- Expected output (files, tests, documentation)
- Dependencies (which sub-tasks must complete first)
- Estimated file paths (for conflict detection)

## Integration Check

After all sub-tasks complete:
1. Verify all modified files are consistent
2. Run the full test suite
3. Check for merge conflicts between sub-task outputs
4. Report any integration issues

## Rules

- One sub-task = one bounded piece of work
- Maximum 8 sub-tasks per decomposition
- Maximum 4 workers by default
- Always run full test suite after integration
- Report partial success if some sub-tasks fail
