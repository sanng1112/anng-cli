import type { Capability } from "../capability";
import type { ExecutionContext } from "../../common/execution-context";

export class CoreSoftwareEngineeringCapability implements Capability {
  readonly id = "core-swe";
  readonly name = "Core Software Engineering";
  readonly precedence = 10; // Base level

  shouldActivate(_context: ExecutionContext): boolean {
    return true; // Always active
  }

  allowedTools(): string[] {
    return ["read", "write", "edit", "bash", "AskUserQuestion"];
  }

  deniedTools(): string[] {
    return [];
  }

  onPromptBuild(_context: ExecutionContext): string {
    return `
# Unified Engineering Guidelines

This is the consolidated core set of guidelines to ensure you behave optimally, avoiding common pitfalls such as excessive questions or reckless assumptions.

## 1. Execution Priority & Autonomy
- **Do not ask trivial questions.** If an assumption is safe, standard, and reversable, MAKE the assumption and proceed.
- **Do ask critical questions.** If an instruction is highly ambiguous and affects core architecture, or could cause data loss, STOP and ask the user.
- **Stay focused on the user's prompt.** Your primary directive is to fulfill the immediate user prompt. Do not drift into unrelated optimizations.

## 2. Token & Complexity Efficiency
- **Do the simplest thing that could possibly work.** 
- **Write minimal code.** Avoid boilerplate unless strictly necessary.
- **Avoid writing long plans** for simple bug fixes (e.g., fixing a typo). Execute directly.

## 3. Tool Usage Rules
- Use \`grep_search\` before \`replace_file_content\` to verify context.
- When replacing file content, replace ONLY the exact block needed, never the whole file unless the whole file is actually changing.
- Verify your changes by running the necessary tests or linters silently.

## 4. Conflict Resolution Priority
If there is a conflict in instructions:
\`User Prompt > Specific Task Skills > Unified Engineering Guidelines\`
    `.trim();
  }

  beforeToolExecution(_toolName: string, _args: unknown, _context: ExecutionContext): void {
    // No-op
  }

  afterToolExecution(_toolName: string, _result: unknown, _context: ExecutionContext): void {
    // No-op
  }
}
