import { z } from "zod";

export type DpSubagentRole = "worker" | "tester";

/**
 * Cấu hình (Ruler) cho một Subagent đơn lẻ trong một Tiểu nhóm DP.
 * Nó bị khóa cứng các kỹ năng (allowedSkills) để tránh "chồng lấn kỹ năng".
 */
export interface DpSubagentProfile {
  id: string; // Mã định danh duy nhất (VD: "agent_A", "agent_B")
  name: string; // Tên hiển thị, ví dụ: "Researcher", "Writer", "Reviewer"
  role: DpSubagentRole;
  systemPrompt: string;
  allowedSkills: string[];
}

export type EdgeCondition = "always" | "on_success" | "on_reject";

export interface DpAgentEdge {
  from: string; // ID của Agent nguồn
  to: string; // ID của Agent đích (hoặc "END" để kết thúc)
  condition: EdgeCondition;
}

/**
 * Cấu hình cho một Tiểu nhóm nguyên tử (Micro-team).
 * Bây giờ là một Đồ thị (Graph) hoàn chỉnh.
 */
export interface DpSubteamConfig {
  agents: DpSubagentProfile[];
  edges: DpAgentEdge[];
  startAgentId: string;
  maxRetries: number;
}

/**
 * Trạng thái thực thi của một bản sao (Clone/Node) trong DP.
 */
export interface DpPlanNode {
  id: string;
  inputData: unknown;
  status: "pending" | "running" | "completed" | "failed";
  output?: string;
  liveOutput?: string;
  error?: string;
  retries: number;
}

/**
 * Toàn bộ bản thiết kế Plan do Trưởng nhóm đề xuất.
 */
export interface DpProposal {
  taskPrompt: string;
  subteamConfig: DpSubteamConfig;
  concurrencyLimit: number;
  dataChunks: unknown[];
}

/**
 * Kế hoạch thực thi chính thức.
 */
export interface DpExecutionPlan {
  id: string;
  proposal: DpProposal;
  nodes: DpPlanNode[];
  status: "idle" | "running" | "completed" | "failed";
}

// ============================================================
// Zod Schemas for LLM Generation
// ============================================================

export const DpSubagentProfileSchema = z.object({
  id: z.string().describe("Unique identifier for this agent (e.g. 'agent_A')"),
  name: z.string().describe("Name of the subagent (e.g. Researcher, Writer, Reviewer)"),
  role: z.enum(["worker", "tester"]),
  systemPrompt: z.string().describe("Instructions specific to this subagent's role"),
  allowedSkills: z.array(z.string()).describe("List of allowed tool IDs (e.g. 'read_file', 'write_to_file')"),
});

export const DpAgentEdgeSchema = z.object({
  from: z.string().describe("Source agent ID"),
  to: z.string().describe("Target agent ID, or 'END' to finish the workflow"),
  condition: z.enum(["always", "on_success", "on_reject"]).describe("Condition to trigger this transition"),
});

export const DpSubteamConfigSchema = z.object({
  agents: z.array(DpSubagentProfileSchema).describe("List of agents acting as nodes in the graph"),
  edges: z.array(DpAgentEdgeSchema).describe("List of edges defining the workflow transitions"),
  startAgentId: z.string().describe("The ID of the first agent to execute"),
  maxRetries: z.number().int().min(0).max(5).default(2),
});

export const DpProposalSchema = z.object({
  taskPrompt: z.string().describe("The overarching goal for each subteam chunk"),
  subteamConfig: DpSubteamConfigSchema,
  concurrencyLimit: z.number().int().min(1).max(50).default(5),
  dataChunks: z.array(z.unknown()).describe("Array of data items to be processed in parallel"),
});
