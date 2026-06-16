# Capability System Specification

## 1. Overview
The current system relies on appending Markdown (`.md`) files directly into the LLM context. This creates "soft" skills that cannot enforce behavior, cannot load dynamic plugins, and waste prompt tokens if the skill is not relevant to the current task.

The Target Architecture transitions to a formal **Capability System**, where skills are executable modules (Classes/Interfaces) rather than text strings.

## 2. Core Interface

```typescript
export interface Capability {
  readonly id: string;
  readonly name: string;
  readonly precedence: number; // Higher number overrides lower number

  /**
   * Determine if this capability should be active based on current context
   */
  shouldActivate(context: ExecutionContext): boolean;

  /**
   * Return an array of tool names this capability requires
   */
  allowedTools(): string[];

  /**
   * Return an array of tool names this capability revokes
   */
  deniedTools(): string[];

  /**
   * Dynamic prompt injection. Only outputs what is needed right now.
   */
  onPromptBuild(context: ExecutionContext): string;

  /**
   * Lifecycle hook: Called before a tool executes.
   * Can throw Error to abort execution.
   */
  beforeToolExecution(toolName: string, args: any, context: ExecutionContext): void;

  /**
   * Lifecycle hook: Called after a tool executes successfully.
   */
  afterToolExecution(toolName: string, result: any, context: ExecutionContext): void;
}
```

## 3. Migration Strategy for Existing Skills

Existing `.md` skills will be systematically converted to Typescript Classes:

### Example: Unified Guidelines Skill
**Old:** `unified-guidelines.md` appended to `prompt.ts`.
**New:** `class CoreSoftwareEngineeringCapability implements Capability`
- `shouldActivate`: Returns `true` by default (it's core).
- `onPromptBuild`: Returns the core persona and basic reasoning rules.
- `allowedTools`: `['read', 'write', 'edit', 'bash']`.

### Example: Python Test Runner Skill (Hypothetical Custom Skill)
**Old:** `python-tests.md` telling the LLM "always run pytest".
**New:** `class PythonTestCapability implements Capability`
- `shouldActivate`: Returns `true` ONLY IF `context.workspaceRoot` contains `pytest.ini`.
- `onPromptBuild`: "Ensure all new features include pytest functions."
- `afterToolExecution`: If tool `write` modifies `.py`, automatically enqueue a `pytest` bash command behind the scenes.

## 4. Conflict Resolution & Precedence
When multiple active Capabilities provide conflicting rules:
1. Capabilities are sorted by `precedence` ascending.
2. `deniedTools` ALWAYS overrides `allowedTools`. If Capability A (precedence 10) allows `bash`, but Capability B (precedence 5) denies `bash`, the tool is denied. Safe-by-default architecture.
3. `onPromptBuild` strings are concatenated with explicit XML namespace delimiters `<capability id="XYZ">`.
