import { z } from "zod";

export type DpSubagentRole = "worker" | "tester";

/**
 * Cấu hình (Ruler) cho một Subagent đơn lẻ trong một Tiểu nhóm DP.
 * Nó bị khóa cứng các kỹ năng (allowedSkills) để tránh "chồng lấn kỹ năng".
 */
export interface DpSubagentProfile {
  name: string; // Tên hiển thị, ví dụ: "Researcher", "Writer", "Reviewer"
  role: DpSubagentRole;
  systemPrompt: string;
  allowedSkills: string[];
}

/**
 * Cấu hình cho một Tiểu nhóm nguyên tử (Micro-team).
 * Theo kiến trúc, một tiểu nhóm chứa một chuỗi các agent chạy tuần tự.
 */
export interface DpSubteamConfig {
  agents: DpSubagentProfile[];
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
  name: z.string().describe("Name of the subagent (e.g. Researcher, Writer, Reviewer)"),
  role: z.enum(["worker", "tester"]),
  systemPrompt: z.string().describe("Instructions specific to this subagent's role"),
  allowedSkills: z.array(z.string()).describe("List of allowed tool IDs (e.g. 'read_file', 'write_to_file')"),
});

export const DpSubteamConfigSchema = z.object({
  agents: z
    .array(DpSubagentProfileSchema)
    .describe("List of agents in this subteam that run sequentially. Order matters."),
  maxRetries: z.number().int().min(0).max(5).default(2),
});

export const DpProposalSchema = z.object({
  taskPrompt: z.string().describe("The overarching goal for each subteam chunk"),
  subteamConfig: DpSubteamConfigSchema,
  concurrencyLimit: z.number().int().min(1).max(50).default(5),
  dataChunks: z.array(z.unknown()).describe("Array of data items to be processed in parallel"),
});
