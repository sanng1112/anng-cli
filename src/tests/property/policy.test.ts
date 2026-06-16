import { describe, it } from "node:test";
import assert from "node:assert";
import fc from "fast-check";
import { PolicyEngine } from "../../team/policy-engine";
import type { ExecutionContext } from "../../common/execution-context";

describe("Property Based Tests: Policy Engine", () => {
  it("Planning Jail Invariant: Planning mode must ALWAYS yield DENY for mutating tools", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("bash", "write", "edit"),
        fc.dictionary(fc.string(), fc.string()),
        fc.boolean(),
        (toolName, args, autoAcceptTools) => {
          const engine = new PolicyEngine();
          const context: ExecutionContext = {
            sessionId: "test",
            mode: "planning",
            phase: "executing",
            permissions: { canWrite: true, canExecute: true, autoAcceptTools, requireUserApproval: [] },
            activeAgentId: "agent-1",
            workspaceRoot: "/project",
            taskScope: null,
            activeCapabilities: [],
          };

          const decision = engine.evaluate({
            toolName,
            arguments: args,
            context,
            originalToolCallId: "1",
          });

          assert.strictEqual(decision.type, "DENY", `Planning mode failed to deny mutating tool: ${toolName}`);
        }
      )
    );
  });

  it("Scope Jail Invariant: Path outside taskScope must ALWAYS yield DENY for writing", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("write", "edit"),
        fc.string({ minLength: 1 }).filter((s) => !s.includes("src/ui") && !s.includes("*")),
        (toolName, badPath) => {
          const engine = new PolicyEngine();
          const context: ExecutionContext = {
            sessionId: "test",
            mode: "autonomous",
            phase: "executing",
            permissions: { canWrite: true, canExecute: true, autoAcceptTools: true, requireUserApproval: [] },
            activeAgentId: "agent-1",
            workspaceRoot: "/project",
            taskScope: {
              taskId: "task-1",
              allowedPaths: ["src/ui/**/*.ts"],
              readOnlyPaths: [],
            },
            activeCapabilities: [],
          };

          const decision = engine.evaluate({
            toolName,
            arguments: { file_path: badPath },
            context,
            originalToolCallId: "1",
          });

          assert.strictEqual(decision.type, "DENY", `Scope jail failed to deny bad path: ${badPath}`);
        }
      )
    );
  });
});
