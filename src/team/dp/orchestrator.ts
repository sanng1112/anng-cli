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
  "taskPrompt": "Mô tả công việc tổng thể và chi tiết cho toàn bộ các clones",
  "concurrencyLimit": 2,
  "subteamConfig": {
    "agents": [
      { 
        "name": "Tên Agent (VD: Researcher)", 
        "role": "worker hoặc tester", 
        "systemPrompt": "Viết RẤT CHI TIẾT (Role, Context, Rules, Format, Constraints). Đừng viết chung chung.", 
        "allowedSkills": ["Liệt kê các tools cần thiết: read_file, write_to_file, grep_search, run_command, search_web..."] 
      }
    ],
    "maxRetries": 2
  },
  "dataChunks": ["dữ liệu 1", "dữ liệu 2"]
}
Lưu ý quan trọng:
1. Bạn CẦN thiết kế một Pipeline gồm nhiều Agents nối tiếp nhau nếu công việc phức tạp.
2. System Prompt của mỗi Agent phải thật chuyên sâu và sắc bén.
3. allowedSkills phải cấp quyền đúng với nhiệm vụ (ví dụ Agent cần đọc file thì cấp read_file, cần search web thì cấp search_web, đừng để trống nếu cần thiết).
4. Trả về DUY NHẤT JSON nguyên thủy, tuyệt đối không dùng block \`\`\`json.`,
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
        const sandboxDir = `.anng/memory/dp_temp/${node.id}`;
        void sandboxDir;
        const { client, model } = createOpenAIClient(this.projectRoot);
        if (!client) throw new Error("Thiếu cấu hình API Key.");

        const outputDir = path.join(this.projectRoot, "dp_output");
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        let step = 0;
        let localRetries = 0;
        const outputs: string[] = [];

        while (step < plan.proposal.subteamConfig.agents.length) {
          const agent = plan.proposal.subteamConfig.agents[step];
          const previousOutput = step > 0 ? outputs[step - 1] : "";

          if (agent.role === "worker") {
            const workerStream = await client.chat.completions.create({
              model,
              stream: true,
              messages: [
                { role: "system", content: agent.systemPrompt },
                {
                  role: "user",
                  content: `Task: ${plan.proposal.taskPrompt}\n\nData: ${JSON.stringify(node.inputData)}\n\nPrevious Output (if any): ${previousOutput}`,
                },
              ],
            });

            let currentOutput = "";
            node.liveOutput = `[Agent: ${agent.name}] Đang suy nghĩ...\n`;
            onProgress(plan);

            let chunkCount = 0;
            for await (const chunk of workerStream) {
              const text = chunk.choices[0]?.delta?.content || "";
              currentOutput += text;
              node.liveOutput += text;

              chunkCount++;
              if (chunkCount % 5 === 0) onProgress(plan);
            }
            outputs[step] = currentOutput;
            onProgress(plan);
            step++; // Tiến lên agent tiếp theo
            localRetries = 0; // Reset số lần thử lại cho agent tiếp theo
          } else if (agent.role === "tester") {
            const currentOutput = step > 0 ? outputs[step - 1] : "";
            const testerStream = await client.chat.completions.create({
              model,
              stream: true,
              messages: [
                { role: "system", content: agent.systemPrompt },
                {
                  role: "user",
                  content: `Kiểm tra xem kết quả sau có đáp ứng Task: "${plan.proposal.taskPrompt}" không.\nKết quả: ${currentOutput}\n\nTrang đầu tiên trả lời YES hoặc NO. Nếu NO, hãy giải thích lý do để làm lại.`,
                },
              ],
            });

            let review = "";
            node.liveOutput = `[Agent: ${agent.name}] Đang đánh giá...\n`;
            onProgress(plan);

            let chunkCount = 0;
            for await (const chunk of testerStream) {
              const text = chunk.choices[0]?.delta?.content || "";
              review += text;
              node.liveOutput += text;

              chunkCount++;
              if (chunkCount % 5 === 0) onProgress(plan);
            }
            onProgress(plan);

            if (review.toUpperCase().includes("NO")) {
              if (localRetries < plan.proposal.subteamConfig.maxRetries && step > 0) {
                localRetries++;
                step--; // Lùi lại 1 bước để worker trước đó làm lại
                node.liveOutput = `\n[Agent: ${agent.name}] TỪ CHỐI KẾT QUẢ! Yêu cầu làm lại (Lần ${localRetries}/${plan.proposal.subteamConfig.maxRetries})...\n`;
                onProgress(plan);
                continue;
              } else {
                throw new Error(`${agent.name} từ chối kết quả cuối cùng: ` + review.slice(0, 100));
              }
            } else {
              // Nếu duyệt, output của tester chính là output của worker trước đó (truyền tiếp)
              outputs[step] = outputs[step - 1];
              step++;
              localRetries = 0;
            }
          }
        }

        const finalOutput = outputs[outputs.length - 1] || "";
        node.status = "completed";
        const fileName = `output_${node.id}.md`;
        fs.writeFileSync(path.join(outputDir, fileName), finalOutput);
        node.output = `Đã lưu kết quả tại dp_output/${fileName}`;
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
