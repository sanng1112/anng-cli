import type { ExecutionContext } from "../common/execution-context";

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
  beforeToolExecution(toolName: string, args: unknown, context: ExecutionContext): void;

  /**
   * Lifecycle hook: Called after a tool executes successfully.
   */
  afterToolExecution(toolName: string, result: unknown, context: ExecutionContext): void;
}
