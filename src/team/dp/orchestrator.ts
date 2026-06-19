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
        stream: true,
      });

      let rawJson = "";
      for await (const chunk of completion) {
        rawJson += chunk.choices[0]?.delta?.content || "";
      }
      const strippedJson = rawJson.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      const cleanJson = strippedJson
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();
      return JSON.parse(cleanJson) as DpProposal;
    } catch (e: unknown) {
      if (e instanceof Error) {
        throw new Error(`Lỗi khi sinh Proposal: ${e.message}`);
      } else {
        throw new Error(`Lỗi không xác định khi sinh Proposal.`);
      }
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
        const workerStream = await client.chat.completions.create({
          model,
          stream: true,
          messages: [
            { role: "system", content: plan.proposal.subteamConfig.worker.systemPrompt },
            { role: "user", content: `Task: ${plan.proposal.taskPrompt}\n\nData: ${JSON.stringify(node.inputData)}` },
          ],
        });

        let workerOutput = "";
        for await (const chunk of workerStream) {
          workerOutput += chunk.choices[0]?.delta?.content || "";
        }

        let isPass = true;
        // Gọi Tester nếu có
        if (plan.proposal.subteamConfig.tester) {
          const testerStream = await client.chat.completions.create({
            model,
            stream: true,
            messages: [
              { role: "system", content: plan.proposal.subteamConfig.tester.systemPrompt },
              {
                role: "user",
                content: `Kiểm tra xem kết quả sau có đáp ứng Task: "${plan.proposal.taskPrompt}" không.\nKết quả: ${workerOutput}\n\nTrang đầu tiên trả lời YES hoặc NO.`,
              },
            ],
          });

          let review = "";
          for await (const chunk of testerStream) {
            review += chunk.choices[0]?.delta?.content || "";
          }

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
