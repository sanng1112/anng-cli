import React from "react";
import { Box, Text } from "ink";
import type { TeamResult } from "../../team/types";

type TeamStatusPanelProps = {
  result: TeamResult;
};

export const TeamStatusPanel: React.FC<TeamStatusPanelProps> = ({ result }) => {
  return (
    <Box flexDirection="column" borderStyle="single" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold>
          Team {result.status === "completed" ? "✅" : result.status === "partial" ? "⚠️" : "❌"}{" "}
          {result.executiveSummary}
        </Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text dimColor>Task Results:</Text>
        {Object.entries(result.taskResults).map(([taskId, taskResult]) => (
          <Box key={taskId} marginLeft={2}>
            <Text>{taskResult.ok ? "  ✅" : "  ❌"} </Text>
            <Text>{taskResult.summary}</Text>
            <Text dimColor>
              {" "}
              ({taskResult.durationMs}ms, {taskResult.usage.totalTokens} tokens)
            </Text>
          </Box>
        ))}
      </Box>

      <Box>
        <Text dimColor>
          Total: {result.totalUsage.totalTokens} tokens | {result.totalDurationMs}ms | {result.completedTasks}/
          {result.totalTasks} tasks completed
        </Text>
      </Box>
    </Box>
  );
};
