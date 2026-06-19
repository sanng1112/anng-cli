import React, { useState, useEffect, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import fs from "fs";
import path from "path";
import { DpOrchestrator } from "../../team/dp/orchestrator";
import type { DpExecutionPlan, DpProposal, DpPlanNode } from "../../team/dp/types";

export interface TeamDpConfigViewProps {
  initialPrompt?: string;
  onCancel: () => void;
  projectRoot: string;
}

export function TeamDpConfigView({ initialPrompt, onCancel, projectRoot }: TeamDpConfigViewProps) {
  const [phase, setPhase] = useState<
    "setup" | "review" | "editing_worker" | "editing_tester" | "executing" | "done" | "error"
  >("setup");
  const [proposal, setProposal] = useState<DpProposal | null>(null);
  const [plan, setPlan] = useState<DpExecutionPlan | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [orchestrator] = useState(() => new DpOrchestrator(projectRoot));

  // Navigation states
  const [execCursor, setExecCursor] = useState(0);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [reviewCursor, setReviewCursor] = useState(0);
  const [editingAgentIndex, setEditingAgentIndex] = useState<number | null>(null);

  const reviewOptions: string[] = useMemo(() => {
    const opts = ["🚀 Phê duyệt & Chạy"];
    if (proposal) {
      proposal.subteamConfig.agents.forEach((agent) => {
        opts.push(`✏️ Chỉnh sửa Agent: ${agent.name} (${agent.role})`);
      });
    }
    return opts;
  }, [proposal]);

  useEffect(() => {
    if (initialPrompt && phase === "setup") {
      setPhase("review");
      orchestrator
        .generateProposal("system", initialPrompt)
        .then((p: DpProposal) => setProposal(p))
        .catch((e: Error) => {
          setErrorMsg(e.message);
          setPhase("error");
        });
    }
  }, [initialPrompt, phase, orchestrator]);

  useInput((input, key) => {
    if (phase === "executing" || phase === "done") {
      if (key.upArrow) setExecCursor((c) => Math.max(0, c - 1));
      if (key.downArrow && plan) setExecCursor((c) => Math.min(plan.nodes.length - 1, c + 1));
      if (key.return && plan) {
        if (selectedNode) setSelectedNode(null);
        else setSelectedNode(plan.nodes[execCursor]?.id || null);
      }
      if (key.escape) {
        if (selectedNode) setSelectedNode(null);
        else onCancel();
      }
      return;
    }

    if (phase === "review" && proposal) {
      if (key.upArrow) setReviewCursor((c) => Math.max(0, c - 1));
      if (key.downArrow) setReviewCursor((c) => Math.min(reviewOptions.length - 1, c + 1));
      if (key.return) {
        if (reviewCursor === 0) {
          setPhase("executing");
          const newPlan = orchestrator.compilePlan(proposal);
          setPlan(newPlan);
          setExecCursor(0);
          void orchestrator.executePlan(newPlan, (updatedPlan: DpExecutionPlan) => {
            setPlan({ ...updatedPlan });
            if (updatedPlan.status === "completed" || updatedPlan.status === "failed") {
              setPhase("done");
            }
          });
        } else if (reviewCursor > 0 && proposal) {
          const agentIndex = reviewCursor - 1;
          const agent = proposal.subteamConfig.agents[agentIndex];
          if (agent) {
            const tempDir = path.join(projectRoot, ".anng", "memory", "dp_temp");
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
            const tempFile = path.join(tempDir, `edit_agent_${agentIndex}.md`);
            fs.writeFileSync(tempFile, agent.systemPrompt);
            setEditingAgentIndex(agentIndex);
            setPhase("editing_worker");
          }
        }
      }
      if (key.escape) onCancel();
      return;
    }

    if (phase === "editing_worker") {
      if (key.escape) {
        setPhase("review");
        setEditingAgentIndex(null);
      }
      if (key.return && proposal && editingAgentIndex !== null) {
        const tempFile = path.join(projectRoot, ".anng", "memory", "dp_temp", `edit_agent_${editingAgentIndex}.md`);
        try {
          const newContent = fs.readFileSync(tempFile, "utf-8").trim();
          const newProposal = { ...proposal };
          newProposal.subteamConfig.agents[editingAgentIndex].systemPrompt = newContent;
          setProposal(newProposal);
        } catch (e) {
          // Ignore read error
        }
        setPhase("review");
        setEditingAgentIndex(null);
      }
      return;
    }

    if (key.escape) {
      onCancel();
    }

    if (key.return) {
      if (phase === "setup" && !initialPrompt) {
        setPhase("review");
        orchestrator
          .generateProposal("system", "Tạo 3 cốt truyện...")
          .then((p: DpProposal) => setProposal(p))
          .catch((e: Error) => {
            setErrorMsg(e.message);
            setPhase("error");
          });
      }
    }
  });

  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor="#D4704B">
      <Text color="#D4704B" bold>
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

      {phase === "error" && (
        <Box marginY={1} flexDirection="column">
          <Text color="red" bold>
            ❌ Đã xảy ra lỗi:
          </Text>
          <Text>{errorMsg}</Text>
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
          <Text>
            - Kiến trúc Tiểu nhóm: Tuần tự {proposal.subteamConfig.agents.length} agents (
            {proposal.subteamConfig.agents.map((a) => a.name).join(" -> ")})
          </Text>
          <Text>- Số lượng bản sao (Clones): {proposal.dataChunks.length} nodes</Text>
          <Text>- Luồng đồng thời tối đa (Concurrency): {proposal.concurrencyLimit}</Text>

          <Box marginTop={1} flexDirection="column">
            {reviewOptions.map((opt, i) => {
              return (
                <Text key={i} color={reviewCursor === i ? "green" : "white"}>
                  {reviewCursor === i ? "> " : "  "}
                  {opt}
                </Text>
              );
            })}
          </Box>
        </Box>
      )}

      {phase === "editing_worker" && editingAgentIndex !== null && proposal && (
        <Box marginY={1} flexDirection="column">
          <Text color="yellow" bold>
            ✏️ ĐANG CHỈNH SỬA PROMPT CHO: {proposal.subteamConfig.agents[editingAgentIndex]?.name.toUpperCase()}
          </Text>
          <Text color="gray">────────────────────────────────────────────────────────</Text>
          <Box marginY={1} flexDirection="column">
            <Text>Vui lòng mở file sau trong IDE của bạn để chỉnh sửa:</Text>
            <Text color="cyan">
              {path.join(projectRoot, ".anng", "memory", "dp_temp", `edit_agent_${editingAgentIndex}.md`)}
            </Text>
          </Box>
          <Text color="gray">────────────────────────────────────────────────────────</Text>
          <Text color="green"> [ Nhấn ENTER khi bạn đã sửa và lưu file xong ]</Text>
          <Text color="gray"> [ Nhấn ESC để hủy thay đổi ]</Text>
        </Box>
      )}

      {(phase === "executing" || phase === "done") && plan && (
        <Box marginY={1} flexDirection="column">
          {!selectedNode && (
            <Box flexDirection="column">
              <Text color="yellow" bold>
                🚀 THE MASTER PLAN: {proposal?.taskPrompt.slice(0, 50)}... (
                {plan.nodes.filter((n: DpPlanNode) => n.status === "completed").length}/{plan.nodes.length})
              </Text>
              <Text color="gray">────────────────────────────────────────────────────────</Text>
              <Box flexDirection="column" marginLeft={2}>
                {plan.nodes.map((node: DpPlanNode, i: number) => (
                  <Text key={node.id} color={execCursor === i ? "cyan" : "white"}>
                    {execCursor === i ? "> " : "  "}[
                    {node.status === "completed"
                      ? "✓"
                      : node.status === "failed"
                        ? "✗"
                        : node.status === "running"
                          ? "↻"
                          : " "}
                    ] Task {node.id.split("-").pop()}: {JSON.stringify(node.inputData)}
                  </Text>
                ))}
              </Box>
              <Text color="gray">────────────────────────────────────────────────────────</Text>
              <Text color="gray"> [ Nhấn Enter để xem chi tiết | Nhấn Lên/Xuống để cuộn | Nhấn ESC để thoát ]</Text>
            </Box>
          )}

          {selectedNode && (
            <Box flexDirection="column">
              <Text color="yellow" bold>
                🔍 CHI TIẾT: Task {selectedNode}
              </Text>
              <Text color="gray">────────────────────────────────────────────────────────</Text>
              <Box marginY={1} marginLeft={2}>
                <Text>
                  {plan.nodes.find((n: DpPlanNode) => n.id === selectedNode)?.output ||
                    "Đang chờ kết quả hoặc lỗi hiển thị tại đây..."}
                </Text>
              </Box>
              <Text color="gray">────────────────────────────────────────────────────────</Text>
              <Text color="gray"> [ Nhấn ESC để quay lại Menu Tiến Trình ]</Text>
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
