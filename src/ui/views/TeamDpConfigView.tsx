import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { DpOrchestrator } from "../../team/dp/orchestrator";
import type { DpExecutionPlan, DpProposal, DpPlanNode } from "../../team/dp/types";

export interface TeamDpConfigViewProps {
  initialPrompt?: string;
  onCancel: () => void;
}

export function TeamDpConfigView({ initialPrompt, onCancel }: TeamDpConfigViewProps) {
  const [phase, setPhase] = useState<"setup" | "review" | "executing" | "done">("setup");
  const [proposal, setProposal] = useState<DpProposal | null>(null);
  const [plan, setPlan] = useState<DpExecutionPlan | null>(null);
  const [orchestrator] = useState(() => new DpOrchestrator());

  useEffect(() => {
    if (initialPrompt && phase === "setup") {
      setPhase("review");
      orchestrator.generateProposal("system", initialPrompt).then((p: DpProposal) => setProposal(p));
    }
  }, [initialPrompt, phase, orchestrator]);

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
    }

    if (key.return) {
      if (phase === "setup" && !initialPrompt) {
        setPhase("review");
        // Fallback mock if no prompt provided
        orchestrator.generateProposal("system", "Tạo 3 cốt truyện...").then((p: DpProposal) => setProposal(p));
      } else if (phase === "review" && proposal) {
        setPhase("executing");
        const newPlan = orchestrator.compilePlan(proposal);
        setPlan(newPlan);

        // Bắt đầu chạy
        void orchestrator.executePlan(newPlan, (updatedPlan: DpExecutionPlan) => {
          // Bắt buộc clone object để React re-render
          setPlan({ ...updatedPlan });
          if (updatedPlan.status === "completed" || updatedPlan.status === "failed") {
            setPhase("done");
          }
        });
      }
    }
  });

  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor="cyan">
      <Text color="cyan" bold>
        🚀 Trưởng nhóm Data Parallelism (DP)
      </Text>

      {phase === "setup" && (
        <Box marginY={1} flexDirection="column">
          <Text>Nhập lệnh của bạn từ CLI (VD: /team-dp Tạo 50 cốt truyện từ data.json)</Text>
          {initialPrompt ? (
            <Text color="green">Đang xử lý: {initialPrompt}</Text>
          ) : (
            <Text color="yellow">Bạn chưa nhập lệnh. Nhấn [ENTER] để chạy MOCK thử nghiệm.</Text>
          )}
        </Box>
      )}

      {phase === "review" && !proposal && (
        <Box marginY={1}>
          <Text>⏳ Trưởng nhóm đang phân tích yêu cầu và gọi LLM...</Text>
        </Box>
      )}

      {phase === "review" && proposal && (
        <Box marginY={1} flexDirection="column">
          <Text color="yellow" bold>
            BẢN ĐỀ XUẤT (PROPOSAL)
          </Text>
          <Text>
            {"\n"}- Nhiệm vụ: {proposal.taskPrompt}
          </Text>
          <Text>- Kiến trúc Tiểu nhóm: Worker + {proposal.subteamConfig.tester ? "Tester" : ""}</Text>
          <Text>- Quy định Worker: {proposal.subteamConfig.worker.allowedSkills.join(", ")}</Text>
          <Text>- Số lượng bản sao (Clones): {proposal.dataChunks.length} nodes</Text>
          <Text>- Luồng đồng thời tối đa (Concurrency): {proposal.concurrencyLimit}</Text>

          <Box marginTop={1}>
            <Text color="green">Nhấn [ENTER] để Phê duyệt & Chạy (Approve & Execute).</Text>
          </Box>
        </Box>
      )}

      {(phase === "executing" || phase === "done") && plan && (
        <Box marginY={1} flexDirection="column">
          <Text color="yellow" bold>
            TIẾN TRÌNH THỰC THI ({plan.nodes.filter((n: DpPlanNode) => n.status === "completed").length}/
            {plan.nodes.length})
          </Text>
          <Box flexDirection="column" marginLeft={2}>
            {plan.nodes.map((node: DpPlanNode) => (
              <Box key={node.id}>
                {node.status === "pending" && <Text color="gray">⏳</Text>}
                {node.status === "running" && <Text color="blue">↻</Text>}
                {node.status === "completed" && <Text color="green">✓</Text>}
                {node.status === "failed" && <Text color="red">✗</Text>}
                <Text>
                  {" "}
                  Task {node.id.split("-").pop()} [Retries: {node.retries}] - {JSON.stringify(node.inputData)}
                </Text>
              </Box>
            ))}
          </Box>
          {phase === "done" && (
            <Box marginTop={1}>
              <Text color="green" bold>
                Hoàn thành toàn bộ kế hoạch!
              </Text>
            </Box>
          )}
        </Box>
      )}

      <Box marginTop={1}>
        <Text color="gray">Nhấn ESC để hủy và quay lại.</Text>
      </Box>
    </Box>
  );
}
