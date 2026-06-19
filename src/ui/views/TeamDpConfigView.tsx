import React from "react";
import { Box, Text, useInput } from "ink";

export interface TeamDpConfigViewProps {
  onCancel: () => void;
}

export function TeamDpConfigView({ onCancel }: TeamDpConfigViewProps) {
  useInput((input, key) => {
    if (key.escape) {
      onCancel();
    }
  });

  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor="cyan">
      <Text color="cyan" bold>
        🚀 [WIP] Cấu hình Data Parallelism (DP)
      </Text>
      <Box marginY={1} flexDirection="column">
        <Text>Tính năng nhân bản hàng loạt đang được phát triển theo kiến trúc: Worker + Tester.</Text>
        <Text>Tương lai: Trưởng nhóm sẽ sinh ra các Tiểu nhóm tự động scale dựa trên lượng data đầu vào.</Text>
      </Box>
      <Text color="gray">Nhấn ESC để quay lại màn hình chính</Text>
    </Box>
  );
}
