import { z } from "zod";

// ============================================================
// Agent Contract
// ============================================================

export type AgentRole = "coordinator" | "worker" | "reviewer";

export interface AgentContract {
  readonly id: string;
  readonly role: AgentRole;
  readonly authorityLevel: number; // 0 = lowest, 100 = highest
  readonly scope: string[]; // Glob paths this agent is allowed to touch
  readonly allowedCapabilities: string[]; // Which Capability IDs are active
  readonly maxTurns: number; // Prevent infinite loops
}

// ============================================================
// Agent Configuration
// ============================================================

export interface AgentConfig {
  name: string;
  role: AgentRole;
  description?: string;
  model?: string;
  /** Custom API key for this agent. Falls back to parent key if omitted. */
  apiKey?: string;
  /** Custom base URL for this agent. Useful for different providers (OpenAI, Anthropic, Gemini, Ollama, etc.). */
  baseURL?: string;
  thinkingEnabled?: boolean;
  reasoningEffort?: string;
  skills?: string[];
  systemPrompt?: string;
  maxTurns?: number;
  taskTimeoutMs?: number;
}

// ============================================================
// Zod Validation Schemas
// ============================================================

export const AgentConfigSchema = z.object({
  name: z.string().min(1).max(64),
  role: z.enum(["coordinator", "worker"]),
  description: z.string().optional(),
  model: z.string().optional(),
  skills: z.array(z.string()).optional(),
  systemPrompt: z.string().optional(),
  maxTurns: z.number().int().positive().optional(),
  taskTimeoutMs: z.number().int().positive().optional(),
});

// Additional types for team orchestration
export type TeamExecutionMode = "internal" | "tmux" | "dmux";

export type TeamUIEvent = {
  type: string;
  data?: unknown;
};

export type TeamResult = {
  executiveSummary: string;
  details?: Record<string, unknown>;
};

// Keep existing AgentRole, AgentContract, AgentConfig, AgentConfigSchema below
