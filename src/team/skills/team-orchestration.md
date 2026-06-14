---
name: team-orchestration
description: Orchestrate multi-agent teams for complex software engineering tasks. Decompose large tasks into parallel sub-tasks, dispatch to specialized worker agents, aggregate results. Use when the user asks to build, refactor, or implement something large enough to benefit from parallel execution, mentions "team mode", "parallel agents", "multi-agent", or when a task spans multiple independent modules.
---

# Team Orchestration

Use this skill to orchestrate multi-agent teams for complex tasks.

## When to use

- Use when the task can be decomposed into independent sub-tasks
- Use when speed matters and parallel execution helps
- Use when the task spans multiple files/modules that don't depend on each other
- Do not use for simple single-file changes or tightly-coupled refactors
- Do not use when the user explicitly wants sequential execution

## Workflow

1. **Analyze** the user's request. If the task is large and parallelizable, propose team mode.
2. **Decompose** the task using `TaskDecomposer` — break into sub-tasks with dependencies.
3. **Configure** the team — choose number of workers, models, and dispatch strategy.
4. **Execute** via `TeamOrchestrator.executeTask()`.
5. **Monitor** progress via team status updates.
6. **Report** results with executive summary, completion stats, and any conflicts.

## Team Configuration

### Worker Count
- Default: `os.cpus().length - 1` (minimum 2)
- More workers = faster completion but higher API cost
- Fewer workers = lower cost, simpler coordination

### Model Selection
- Coordinator: `deepseek-v4-pro` (strong reasoning for decomposition)
- Workers: `deepseek-v4-flash` (fast, cheap for focused tasks)

### Dispatch Strategy
- `dependency-order` (default): Respect DAG, maximize parallelism
- `round-robin`: Distribute evenly regardless of skill
- `skill-match`: Match task to worker based on description
- `llm-route`: Coordinator decides best worker per task

## Rules

- Always run file conflict detection before dispatching
- Never assign two workers to the same file simultaneously
- If a worker fails, mark dependent tasks as skipped
- Always aggregate results and report conflicts
- If team mode is unavailable, fall back to sequential execution
