import type { ExecutionContext } from "../common/execution-context";

export type PolicyDecisionType = "ALLOW" | "DENY" | "REQUIRE_APPROVAL";

export interface PolicyDecision {
  type: PolicyDecisionType;
  reason?: string;
}

export interface PolicyRequest {
  toolName: string;
  arguments: Record<string, unknown>;
  context: ExecutionContext;
  originalToolCallId: string;
}

export class PolicyViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyViolationError";
  }
}

export class PolicyEngine {
  public evaluate(request: PolicyRequest): PolicyDecision {
    const { toolName, context } = request;

    // 1. Mode Enforcement
    if (context.mode === "planning") {
      const isMutating = ["bash", "write", "edit"].includes(toolName);
      if (isMutating) {
        return {
          type: "DENY",
          reason: `POLICY_DENY: You cannot use '${toolName}' in planning mode. Use 'UpdatePlan' instead.`,
        };
      }
    }

    // 2. Scope Enforcement (Jail)
    // If there is a taskScope and the tool targets a file path
    if (context.taskScope) {
      const filePath = request.arguments?.file_path;
      if (typeof filePath === "string" && filePath.length > 0) {
        // Must be within allowedPaths if modifying
        if (["write", "edit"].includes(toolName)) {
          const isAllowed = context.taskScope.allowedPaths.some(
            (p) => filePath.includes(p) || p === "**/*" || p === "*"
          );
          if (!isAllowed) {
            return {
              type: "DENY",
              reason: `POLICY_DENY: File '${filePath}' is outside your allowed scope: ${context.taskScope.allowedPaths.join(", ")}`,
            };
          }
        }
      }
    }

    // 3. Auto-Accept fallback
    if (context.permissions.autoAcceptTools) {
      return { type: "ALLOW" };
    }

    // Otherwise require approval
    return { type: "REQUIRE_APPROVAL" };
  }
}
