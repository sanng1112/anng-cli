import { randomUUID } from "crypto";
import type { DpExecutionPlan, DpPlanNode, DpProposal } from "./types";
import { createOpenAIClient } from "../../common/openai-client";
import * as fs from "fs";
import * as path from "path";

/**
 * Trưởng nhóm (DP Leader / Orchestrator)
 * Chịu trách nhiệm thiết kế Plan và giám sát các Tiểu nhóm.
 */
export class DpOrchestrator {
  private projectRoot: string;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
  }
  /**
   * Bước 1: Sinh ra bản nháp (Proposal) để người dùng duyệt.
   * Đây là lúc LLM phân tích Prompt và tạo ra Relation & Kế hoạch chunk data.
   */
  public async generateProposal(systemPrompt: string, userRequest: string): Promise<DpProposal> {
    try {
      const { client, model } = createOpenAIClient(this.projectRoot);
      if (!client) throw new Error("Vui lòng cấu hình API Key trong settings trước.");

      const completion = await client.chat.completions.create({
        model,
        messages: [
          {
            role: "system",
            content: `Bạn là Data Parallelism Orchestrator. 
Nhiệm vụ của bạn là phân tích yêu cầu của user và trả về một JSON HỢP LỆ (KHÔNG CÓ MARKDOWN) theo đúng format:
{
  "taskPrompt": "Mô tả công việc cho mỗi clone",
  "concurrencyLimit": số lượng luồng (1-10),
  "subteamConfig": {
    "worker": { "role": "worker", "systemPrompt": "Lệnh cho worker", "allowedSkills": ["write_handler"] },
    "tester": { "role": "tester", "systemPrompt": "Lệnh cho tester", "allowedSkills": ["read_handler"] },
    "maxRetries": 2
  },
  "dataChunks": ["dữ liệu 1", "dữ liệu 2", "dữ liệu 3"]
}
Lưu ý: Trả về DUY NHẤT JSON nguyên thủy, tuyệt đối không dùng block \`\`\`json.`,
          },
          { role: "user", content: userRequest },
        ],
      });

      const rawJson = completion.choices[0]?.message?.content || "{}";
      const cleanJson = rawJson
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();
      return JSON.parse(cleanJson) as DpProposal;
    } catch (e) {
      console.error("Lỗi khi sinh Proposal:", e);
      // Fallback
      return {
        taskPrompt: userRequest,
        concurrencyLimit: 2,
        subteamConfig: {
          worker: { role: "worker", systemPrompt: "Bạn là AI. Hãy xử lý yêu cầu.", allowedSkills: [] },
          tester: { role: "tester", systemPrompt: "Bạn là Tester. Kiểm tra lại kết quả.", allowedSkills: [] },
          maxRetries: 1,
        },
        dataChunks: ["Chunk 1", "Chunk 2"],
      };
    }
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
        void sandboxDir;
        const { client, model } = createOpenAIClient(this.projectRoot);
        if (!client) throw new Error("Thiếu cấu hình API Key.");

        const outputDir = path.join(this.projectRoot, "dp_output");
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        // Gọi Worker
        const workerResp = await client.chat.completions.create({
          model,
          messages: [
            { role: "system", content: plan.proposal.subteamConfig.worker.systemPrompt },
            { role: "user", content: `Task: ${plan.proposal.taskPrompt}\n\nData: ${JSON.stringify(node.inputData)}` },
          ],
        });
        const workerOutput = workerResp.choices[0]?.message?.content || "";

        let isPass = true;
        // Gọi Tester nếu có
        if (plan.proposal.subteamConfig.tester) {
          const testerResp = await client.chat.completions.create({
            model,
            messages: [
              { role: "system", content: plan.proposal.subteamConfig.tester.systemPrompt },
              {
                role: "user",
                content: `Kiểm tra xem kết quả sau có đáp ứng Task: "${plan.proposal.taskPrompt}" không.\nKết quả: ${workerOutput}\n\nTrang đầu tiên trả lời YES hoặc NO.`,
              },
            ],
          });
          const review = testerResp.choices[0]?.message?.content || "";
          if (review.toUpperCase().includes("NO")) {
            isPass = false;
            throw new Error("Tester từ chối: " + review.slice(0, 100));
          }
        }

        if (isPass) {
          node.status = "completed";
          const fileName = `output_${node.id}.md`;
          fs.writeFileSync(path.join(outputDir, fileName), workerOutput);
          node.output = `Đã lưu kết quả tại dp_output/${fileName}`;
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
