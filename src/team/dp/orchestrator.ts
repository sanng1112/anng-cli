import { randomUUID } from "crypto";
import type { DpExecutionPlan, DpPlanNode, DpProposal } from "./types";

/**
 * Trưởng nhóm (DP Leader / Orchestrator)
 * Chịu trách nhiệm thiết kế Plan và giám sát các Tiểu nhóm.
 */
export class DpOrchestrator {
  /**
   * Bước 1: Sinh ra bản nháp (Proposal) để người dùng duyệt.
   * Đây là lúc LLM phân tích Prompt và tạo ra Relation & Kế hoạch chunk data.
   */
  public async generateProposal(systemPrompt: string, userRequest: string): Promise<DpProposal> {
    // TODO: Tích hợp với OpenAIClient và Structured Outputs để trả về JSON an toàn.
    // Dưới đây là dữ liệu mock để chứng minh kiến trúc (Proof of Concept).

    console.log("Leader đang phân tích yêu cầu:", userRequest);

    return {
      taskPrompt: "Viết cốt truyện dựa trên dữ liệu đầu vào. Bố cục: Hành trình anh hùng.",
      concurrencyLimit: 5,
      subteamConfig: {
        worker: {
          role: "worker",
          systemPrompt: "Bạn là nhà văn. Không làm gì ngoài việc viết truyện.",
          allowedSkills: ["write_to_file"], // Khóa kỹ năng (Giải quyết Bottleneck #1)
        },
        tester: {
          role: "tester",
          systemPrompt: "Bạn là Biên tập viên. Đọc truyện và kiểm tra xem có đạt chuẩn bố cục không.",
          allowedSkills: ["read_file"], // Khóa kỹ năng
        },
        maxRetries: 2,
      },
      dataChunks: [
        { id: 1, theme: "Cyberpunk" },
        { id: 2, theme: "Fantasy" },
        { id: 3, theme: "Space Opera" },
      ],
    };
  }

  /**
   * Bước 2: Nhân bản (Clone) Tiểu nhóm ra thành N Node thực thi.
   */
  public compilePlan(proposal: DpProposal): DpExecutionPlan {
    const nodes: DpPlanNode[] = proposal.dataChunks.map((chunk, index) => ({
      id: `dp-node-${index + 1}-${randomUUID().slice(0, 8)}`,
      inputData: chunk,
      status: "pending",
      retries: 0,
    }));

    return {
      id: `dp-plan-${randomUUID()}`,
      proposal,
      nodes,
      status: "idle",
    };
  }

  /**
   * Bước 3: Điều phối thực thi (Execution Engine)
   */
  public async executePlan(plan: DpExecutionPlan, onProgress: (plan: DpExecutionPlan) => void): Promise<void> {
    plan.status = "running";
    onProgress(plan);

    // Xử lý song song với concurrency limit (Giả lập)
    const runNode = async (node: DpPlanNode) => {
      node.status = "running";
      onProgress(plan);

      try {
        // [QUAN TRỌNG]: Cơ chế Sandboxing (Giải quyết Bottleneck #3)
        // Thay vì dùng chung SessionManager, mỗi Node sẽ tạo một Temporary Session
        // với thư mục làm việc riêng biệt (Workspace Namespace) để tránh Race Condition.
        const sandboxDir = `.anng/memory/dp_temp/${node.id}`;
        void sandboxDir; // TODO: Implement workspace isolation

        // Giả lập thời gian worker chạy
        await new Promise((res) => setTimeout(res, 2000 + Math.random() * 2000));

        // Giả lập Tester kiểm tra
        const isPass = Math.random() > 0.2; // 80% pass

        if (isPass) {
          node.status = "completed";
          node.output = `Đã viết xong cốt truyện cho: ${JSON.stringify(node.inputData)}`;
        } else {
          throw new Error("Tester báo cáo: Không đạt cấu trúc Hero's Journey.");
        }
      } catch (err: unknown) {
        if (node.retries < plan.proposal.subteamConfig.maxRetries) {
          node.retries++;
          // Retry
          await runNode(node);
        } else {
          node.status = "failed";
          node.error = err instanceof Error ? err.message : String(err);
        }
      } finally {
        onProgress(plan);
      }
    };

    // Chạy concurrency
    const limit = plan.proposal.concurrencyLimit;
    const executing = new Set<Promise<void>>();

    for (const node of plan.nodes) {
      const p = runNode(node).finally(() => executing.delete(p));
      executing.add(p);
      if (executing.size >= limit) {
        await Promise.race(executing);
      }
    }
    await Promise.all(executing);

    plan.status = "completed";
    onProgress(plan);
  }
}
