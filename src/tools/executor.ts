import type OpenAI from "openai";
import type { ReasoningEffort } from "../settings";
import { handleAskUserQuestionTool } from "./ask-user-question-handler";
import { handleBashTool } from "./bash-handler";
import { handleEditTool } from "./edit-handler";
import { handleReadTool } from "./read-handler";
import { handleUpdatePlanTool } from "./update-plan-handler";
import { handleWebSearchTool } from "./web-search-handler";
import { handleAnalyzeProjectTool } from "./analyze-project-handler";

import { handleProxyReadTool } from "./proxy-read-handler";
import { handleWriteTool } from "./write-handler";
import type { McpManager } from "../mcp/mcp-manager";
import type { ExecutionContext } from "../common/execution-context";
import { globalCapabilityRegistry } from "../team/capability-registry";
import { PolicyEngine } from "../team/policy-engine";
import { globalAuditLogger } from "../common/audit-logger";

export type CreateOpenAIClient = () => {
  client: OpenAI | null;
  model: string;
  baseURL?: string;
  temperature?: number;
  thinkingEnabled: boolean;
  reasoningEffort?: ReasoningEffort;
  debugLogEnabled?: boolean;
  telemetryEnabled?: boolean;
  notify?: string;
  webSearchTool?: string;
  env?: Record<string, string>;
  machineId?: string;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type ToolExecutionContext = {
  sessionId: string;
  projectRoot: string;
  toolCall: ToolCall;
  createOpenAIClient?: CreateOpenAIClient;
  onProcessStart?: (processId: string | number, command: string) => void;
  onProcessExit?: (processId: string | number) => void;
  onProcessStdout?: (processId: string | number, chunk: string) => void;
  onProcessTimeoutControl?: (processId: string | number, control: ProcessTimeoutControl | null) => void;
  onBackgroundProcessComplete?: (completion: BackgroundProcessCompletion) => void;
  onBeforeFileMutation?: (filePath: string) => void;
  onAfterFileMutation?: (filePath: string) => void;
  bashTimeoutMs?: number;
  bashMinTimeoutMs?: number;
  executionContext?: ExecutionContext;
};

export type ToolExecutionHooks = {
  onProcessStart?: (processId: string | number, command: string) => void;
  onProcessExit?: (processId: string | number) => void;
  onProcessStdout?: (processId: string | number, chunk: string) => void;
  onProcessTimeoutControl?: (processId: string | number, control: ProcessTimeoutControl | null) => void;
  onBackgroundProcessComplete?: (completion: BackgroundProcessCompletion) => void;
  onBeforeFileMutation?: (filePath: string) => void;
  onAfterFileMutation?: (filePath: string) => void;
  shouldStop?: () => boolean;
  executionContext?: ExecutionContext;
};

export type BackgroundProcessCompletion = {
  taskId: string;
  processId: number;
  command: string;
  outputPath: string;
  ok: boolean;
  exitCode: number | null;
  signal: string | null;
  error?: string;
  cwd: string | null;
  shellPath: string;
  startedAtMs: number;
  completedAtMs: number;
};

export type ProcessTimeoutInfo = {
  timeoutMs: number;
  startedAtMs: number;
  deadlineAtMs: number;
  timedOut: boolean;
};

export type ProcessTimeoutControl = {
  getInfo: () => ProcessTimeoutInfo;
  setTimeoutMs: (timeoutMs: number) => ProcessTimeoutInfo;
};

export type ToolExecutionResult = {
  ok: boolean;
  name: string;
  output?: string;
  error?: string;
  metadata?: Record<string, unknown>;
  awaitUserResponse?: boolean;
  followUpMessages?: ToolExecutionFollowUpMessage[];
  // Observation Design properties:
  status?: "success" | "warning" | "error";
  summary?: string;
  nextActions?: string[];
  artifacts?: string[];
};

export type ToolExecutionFollowUpMessage = {
  role: "system";
  content: string;
  contentParams?: unknown | null;
};

export type ToolHandler = (
  args: Record<string, unknown>,
  context: ToolExecutionContext
) => Promise<ToolExecutionResult>;

const BUILT_IN_TOOL_NAME_ALIASES = new Map<string, string>([
  ["Bash", "bash"],
  ["Read", "read"],
  ["Write", "write"],
  ["Edit", "edit"],
]);

export type ToolCallExecution = {
  toolCallId: string;
  content: string;
  result: ToolExecutionResult;
};

export class ToolExecutor {
  private readonly projectRoot: string;
  private readonly createOpenAIClient?: CreateOpenAIClient;
  private readonly mcpManager?: McpManager;
  private readonly toolHandlers = new Map<string, ToolHandler>();

  constructor(projectRoot: string, createOpenAIClient?: CreateOpenAIClient, mcpManager?: McpManager) {
    this.projectRoot = projectRoot;
    this.createOpenAIClient = createOpenAIClient;
    this.mcpManager = mcpManager;
    this.registerToolHandlers();
  }

  async executeToolCalls(
    sessionId: string,
    toolCalls: unknown[],
    hooks?: ToolExecutionHooks
  ): Promise<ToolCallExecution[]> {
    const parsedCalls = toolCalls
      .map((toolCall) => this.parseToolCall(toolCall))
      .filter((toolCall): toolCall is ToolCall => Boolean(toolCall));

    const executions: ToolCallExecution[] = [];
    const safeTools = new Set(["read", "ProxyRead", "WebSearch", "AnalyzeProject"]);

    const batches: ToolCall[][] = [];
    for (const call of parsedCalls) {
      if (batches.length === 0) {
        batches.push([call]);
      } else {
        const currentBatch = batches[batches.length - 1];
        if (safeTools.has(call.function.name) && currentBatch.every((c) => safeTools.has(c.function.name))) {
          currentBatch.push(call);
        } else {
          batches.push([call]);
        }
      }
    }

    for (const batch of batches) {
      if (hooks?.shouldStop?.()) break;

      if (batch.length === 1 || !safeTools.has(batch[0].function.name)) {
        for (const call of batch) {
          if (hooks?.shouldStop?.()) break;
          const result = await this.executeToolCall(sessionId, call, hooks);
          executions.push({
            toolCallId: call.id,
            content: this.formatToolResult(result),
            result,
          });
        }
      } else {
        const batchResults = await Promise.all(
          batch.map(async (call) => {
            if (hooks?.shouldStop?.()) return null;
            const result = await this.executeToolCall(sessionId, call, hooks);
            return {
              toolCallId: call.id,
              content: this.formatToolResult(result),
              result,
            };
          })
        );

        for (const res of batchResults) {
          if (res) executions.push(res);
        }
      }
    }
    return executions;
  }

  private registerToolHandlers(): void {
    this.toolHandlers.set("bash", handleBashTool);
    this.toolHandlers.set("read", handleReadTool);
    this.toolHandlers.set("write", handleWriteTool);
    this.toolHandlers.set("edit", handleEditTool);
    this.toolHandlers.set("AskUserQuestion", handleAskUserQuestionTool);
    this.toolHandlers.set("UpdatePlan", handleUpdatePlanTool);
    this.toolHandlers.set("WebSearch", handleWebSearchTool);
    this.toolHandlers.set("AnalyzeProject", handleAnalyzeProjectTool as unknown as ToolHandler);

    this.toolHandlers.set("ProxyRead", handleProxyReadTool as unknown as ToolHandler);
  }

  private parseToolCall(toolCall: unknown): ToolCall | null {
    if (!toolCall || typeof toolCall !== "object") {
      return null;
    }

    const record = toolCall as {
      id?: unknown;
      type?: unknown;
      function?: { name?: unknown; arguments?: unknown };
    };

    if (typeof record.id !== "string") {
      return null;
    }

    const functionRecord = record.function;
    if (!functionRecord || typeof functionRecord !== "object") {
      return null;
    }

    if (typeof functionRecord.name !== "string") {
      return null;
    }

    const rawArguments = typeof functionRecord.arguments === "string" ? functionRecord.arguments : "";

    return {
      id: record.id,
      type: "function",
      function: {
        name: functionRecord.name,
        arguments: rawArguments,
      },
    };
  }

  private async executeToolCall(
    sessionId: string,
    toolCall: ToolCall,
    hooks?: ToolExecutionHooks
  ): Promise<ToolExecutionResult> {
    const toolName = toolCall.function.name;
    const handlerName = BUILT_IN_TOOL_NAME_ALIASES.get(toolName) ?? toolName;
    const handler = this.toolHandlers.get(handlerName);

    if (!handler && !this.mcpManager?.isMcpTool(toolName)) {
      return {
        ok: false,
        name: toolName,
        error: `Unknown tool: ${toolName}`,
      };
    }

    const parsedArgsResult = this.parseToolArguments(toolCall.function.arguments);
    if (!parsedArgsResult.ok) {
      return {
        ok: false,
        name: toolName,
        error: parsedArgsResult.error,
      };
    }
    const parsedArgs = parsedArgsResult.args;

    if (hooks?.executionContext) {
      const policyEngine = new PolicyEngine();
      const decision = policyEngine.evaluate({
        toolName,
        arguments: parsedArgs,
        context: hooks.executionContext,
        originalToolCallId: toolCall.id,
      });

      if (decision.type === "DENY") {
        return {
          ok: false,
          name: toolName,
          error: decision.reason || "PolicyEngine denied this tool call.",
        };
      }

      const activeCaps = globalCapabilityRegistry.getActiveCapabilities(hooks.executionContext);
      for (const cap of activeCaps) {
        try {
          globalAuditLogger.log({
            correlationId: hooks.executionContext.sessionId,
            eventType: "CAPABILITY_ACTIVATION",
            actorId: hooks.executionContext.activeAgentId ?? "unknown",
            resource: cap.id,
            action: "beforeToolExecution",
            contextSnapshot: hooks.executionContext,
          });
          cap.beforeToolExecution(toolName, parsedArgs, hooks.executionContext);
        } catch (e: unknown) {
          const errMsg = e instanceof Error ? e.message : String(e);
          return { ok: false, name: toolName, error: errMsg };
        }
      }
    }

    const executionContext: ToolExecutionContext = {
      sessionId,
      projectRoot: this.projectRoot,
      toolCall,
      createOpenAIClient: this.createOpenAIClient,
      onProcessStart: hooks?.onProcessStart,
      onProcessExit: hooks?.onProcessExit,
      onProcessStdout: hooks?.onProcessStdout,
      onProcessTimeoutControl: hooks?.onProcessTimeoutControl,
      onBackgroundProcessComplete: hooks?.onBackgroundProcessComplete,
      onBeforeFileMutation: hooks?.onBeforeFileMutation,
      onAfterFileMutation: hooks?.onAfterFileMutation,
      bashMinTimeoutMs: 1000,
      executionContext: hooks?.executionContext,
    };

    let result: ToolExecutionResult;
    try {
      if (handler) {
        result = await handler(parsedArgs, executionContext);
      } else {
        result = await this.mcpManager!.executeMcpTool(toolName, parsedArgs);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result = {
        ok: false,
        name: toolName,
        error: message,
      };
    }

    if (hooks?.executionContext && result.ok) {
      const activeCaps = globalCapabilityRegistry.getActiveCapabilities(hooks.executionContext);
      for (const cap of activeCaps) {
        try {
          cap.afterToolExecution(toolName, result, hooks.executionContext);
        } catch (e: unknown) {
          console.error(`Capability ${cap.id} failed in afterToolExecution:`, e);
        }
      }
    }

    if (hooks?.executionContext) {
      globalAuditLogger.log({
        correlationId: sessionId,
        eventType: "TOOL_EXECUTION",
        actorId: hooks.executionContext.activeAgentId ?? "unknown",
        resource: toolName,
        action: "execute",
        reason: result.ok ? "Success" : `Failed: ${result.error}`,
        contextSnapshot: hooks.executionContext,
      });
    }

    return result;
  }

  private parseToolArguments(
    rawArguments: string
  ): { ok: true; args: Record<string, unknown> } | { ok: false; error: string } {
    if (!rawArguments) {
      return { ok: true, args: {} };
    }

    try {
      const parsed = JSON.parse(rawArguments);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { ok: false, error: "InputParseError: Tool arguments must be a JSON object." };
      }
      return { ok: true, args: parsed as Record<string, unknown> };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        error:
          `InputParseError: Failed to parse tool arguments: ${message}. ` +
          "Ensure the tool call arguments are valid JSON. Prefer Edit over Write for large existing-file changes.",
      };
    }
  }

  private formatToolResult(result: ToolExecutionResult): string {
    const payload: Record<string, unknown> = {
      ok: result.ok,
      name: result.name,
      status: result.status ?? (result.ok ? "success" : "error"),
    };

    if (result.summary) payload.summary = result.summary;
    if (result.nextActions) payload.next_actions = result.nextActions;
    if (result.artifacts) payload.artifacts = result.artifacts;
    if (typeof result.output !== "undefined") payload.output = result.output;
    if (result.error) payload.error = result.error;
    if (result.metadata && Object.keys(result.metadata).length > 0) payload.metadata = result.metadata;
    if (result.awaitUserResponse === true) payload.awaitUserResponse = true;

    return JSON.stringify(payload, null, 2);
  }
}
