import React from "react";
import { Box, Text, useInput } from "ink";

export interface TeamWfConfigViewProps {
  onCancel: () => void;
}

export function TeamWfConfigView({ onCancel }: TeamWfConfigViewProps) {
  useInput((input, key) => {
    if (key.escape) {
      onCancel();
    }
  });

  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor="magenta">
      <Text color="magenta" bold>
        🔗 [WIP] Cấu hình Workflow (WF)
      </Text>
      <Box marginY={1} flexDirection="column">
        <Text>Tính năng dây chuyền Pipeline đang được phát triển bằng mô hình DAG (Đồ thị có hướng).</Text>
        <Text>Tương lai: Bạn có thể nhập prompt để AI sinh ra file YAML cấu hình các Node nối tiếp nhau.</Text>
      </Box>
      <Text color="gray">Nhấn ESC để quay lại màn hình chính</Text>
    </Box>
  );
}
