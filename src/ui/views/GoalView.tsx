/**
 * GoalView – React Ink UI for goal execution progress.
 *
 * Displays a list of steps with status indicators, current step description,
 * output/error logs, and the ability to cancel execution.
 */

import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import type { GoalDef, GoalExecution, GoalStepResult } from "../../goal/types";
import { executeGoal, type ExecutorContext } from "../../goal/executor";
import { loadGoal } from "../../goal/loader";
import { BUILTIN_GOAL_IDS } from "../../goal/builtin-goals";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type GoalViewProps = {
  projectRoot: string;
  goalName: string;
  onCancel: () => void;
  onComplete?: (execution: GoalExecution) => void;
};

type ViewPhase = "loading" | "ready" | "executing" | "done" | "error" | "not-found";

// ─────────────────────────────────────────────────────────────────────────────
// Status helpers
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_ICON: Record<string, string> = {
  pending: " ",
  running: "↻",
  success: "✓",
  failure: "✗",
  skipped: "–",
  cancelled: "⊘",
};

const STATUS_COLOR: Record<string, string> = {
  pending: "gray",
  running: "yellow",
  success: "green",
  failure: "red",
  skipped: "gray",
  cancelled: "yellow",
};

// ─────────────────────────────────────────────────────────────────────────────
// GoalView Component
// ─────────────────────────────────────────────────────────────────────────────

export function GoalView({ projectRoot, goalName, onCancel, onComplete }: GoalViewProps) {
  const [phase, setPhase] = useState<ViewPhase>("loading");
  const [goalDef, setGoalDef] = useState<GoalDef | null>(null);
  const [execution, setExecution] = useState<GoalExecution | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [abortController] = useState(() => new AbortController());

  // Load the goal definition
  useEffect(() => {
    const def = loadGoal(projectRoot, goalName);
    if (!def) {
      setPhase("not-found");
      setErrorMsg(`Goal "${goalName}" not found. Available: ${BUILTIN_GOAL_IDS.join(", ")}`);
      return;
    }
    setGoalDef(def);
    setPhase("ready");
  }, [projectRoot, goalName]);

  // Start execution when ready
  useEffect(() => {
    if (phase !== "ready" || !goalDef) return;

    setPhase("executing");

    const context: ExecutorContext = {
      projectRoot,
      abortSignal: abortController.signal,
      vars: {},
      callbacks: {
        onStatusChange: (exec) => {
          setExecution({ ...exec, stepResults: new Map(exec.stepResults) });
        },
      },
    };

    executeGoal(goalDef, context)
      .then((exec) => {
        setExecution(exec);
        setPhase("done");
        onComplete?.(exec);
      })
      .catch((err) => {
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setPhase("error");
      });
  }, [phase, goalDef, projectRoot, abortController, onComplete]);

  // Handle keyboard input
  useInput((_input, key) => {
    if (phase === "executing" || phase === "done") {
      if (key.upArrow) setCursor((c) => Math.max(0, c - 1));
      if (key.downArrow) setCursor((c) => c + 1);
      if (key.return && execution) {
        const steps = goalDef?.steps ?? [];
        const idx = Math.min(cursor, steps.length - 1);
        const step = steps[idx];
        if (step) {
          if (selectedStepId === step.id) setSelectedStepId(null);
          else setSelectedStepId(step.id);
        }
      }
    }
    if (key.escape) {
      if (selectedStepId) {
        setSelectedStepId(null);
      } else {
        abortController.abort();
        onCancel();
      }
    }
  });

  const steps = useMemo(() => goalDef?.steps ?? [], [goalDef?.steps]);
  const visibleSteps = useMemo(() => {
    return steps.map((step) => {
      let result: GoalStepResult | undefined;
      if (execution) {
        result = execution.stepResults.get(step.id);
      }
      return { step, result };
    });
  }, [steps, execution]);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold>{goalDef ? <Text color="cyan">/goal {goalDef.name}</Text> : <Text>/goal {goalName}</Text>}</Text>
      </Box>

      {phase === "loading" && (
        <Box>
          <Text color="yellow">Loading goal definition...</Text>
        </Box>
      )}

      {phase === "not-found" && (
        <Box flexDirection="column">
          <Text color="red">✗ {errorMsg}</Text>
          <Box marginTop={1}>
            <Text dimColor>Available built-in goals:</Text>
          </Box>
          {BUILTIN_GOAL_IDS.map((id) => (
            <Text key={id} dimColor>
              {" "}
              /goal {id}
            </Text>
          ))}
          <Box marginTop={1}>
            <Text dimColor>Press ESC to go back.</Text>
          </Box>
        </Box>
      )}

      {phase === "error" && (
        <Box flexDirection="column">
          <Text color="red">✗ Execution error: {errorMsg}</Text>
          <Box marginTop={1}>
            <Text dimColor>Press ESC to go back.</Text>
          </Box>
        </Box>
      )}

      {(phase === "executing" || phase === "done") && renderExecutionView()}
    </Box>
  );

  function renderExecutionView() {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text dimColor>
            Steps:{" "}
            {execution
              ? `${Array.from(execution.stepResults.values()).filter((r) => r.status === "success").length}/${steps.length}`
              : `0/${steps.length}`}{" "}
            | Status:{" "}
            <Text
              color={execution?.status === "success" ? "green" : execution?.status === "failure" ? "red" : "yellow"}
            >
              {execution?.status ?? "running"}
            </Text>
          </Text>
        </Box>

        <Text color="gray">────────────────────────────────────────</Text>

        <Box flexDirection="column" marginLeft={2} marginY={1}>
          {visibleSteps.map(({ step, result }, i) => {
            const isSelected = cursor === i && !selectedStepId;
            const isExpanded = selectedStepId === step.id;
            const status = result?.status ?? "pending";
            const icon = STATUS_ICON[status] ?? " ";
            const color = STATUS_COLOR[status] ?? "gray";

            return (
              <Box key={step.id} flexDirection="column">
                <Text color={isSelected ? "cyan" : "white"}>
                  {isSelected ? "> " : "  "}
                  <Text color={color}>{icon}</Text> <Text bold={status === "running"}>{step.id}</Text>
                  {step.description ? <Text dimColor> – {step.description}</Text> : null}
                  {result?.output && !isExpanded ? <Text dimColor> ({result.output.slice(0, 40)}...)</Text> : null}
                </Text>

                {isExpanded && result && (
                  <Box marginLeft={6} marginTop={1} marginBottom={1} flexDirection="column">
                    <Text color="gray">────────────────────────────────</Text>
                    <Text>
                      <Text bold>Status: </Text>
                      <Text color={color}>{status}</Text>
                    </Text>
                    {result.output && (
                      <Box flexDirection="column" marginTop={1}>
                        <Text bold>Output:</Text>
                        <Text wrap="wrap" dimColor>
                          {result.output.length > 500 ? result.output.slice(0, 500) + "..." : result.output}
                        </Text>
                      </Box>
                    )}
                    {result.error && (
                      <Box flexDirection="column" marginTop={1}>
                        <Text bold color="red">
                          Error:
                        </Text>
                        <Text wrap="wrap" color="red">
                          {result.error}
                        </Text>
                      </Box>
                    )}
                    {result.retries && result.retries > 0 ? <Text dimColor>Retries: {result.retries}</Text> : null}
                    <Text color="gray">────────────────────────────────</Text>
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>

        <Text color="gray">────────────────────────────────────────</Text>

        <Box marginTop={1}>
          {phase === "executing" ? (
            <Text dimColor>Executing... Press ESC to cancel.</Text>
          ) : phase === "done" ? (
            <Text dimColor>Goal completed. Press ESC to go back. Use ↑/↓ to navigate, Enter to expand a step.</Text>
          ) : null}
        </Box>
      </Box>
    );
  }
}
