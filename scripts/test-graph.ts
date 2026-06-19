import { DpOrchestrator } from "../src/team/dp/orchestrator.js";
import type { DpExecutionPlan } from "../src/team/dp/types.js";
import path from "path";
import fs from "fs";

// Override console to see output
const orchestrator = new DpOrchestrator(process.cwd());

const mockPlan: DpExecutionPlan = {
  id: "test-graph",
  status: "running",
  nodes: [
    {
      id: "node_1",
      inputData: "Trái cây: Táo, Chuối",
      status: "pending",
      retries: 0,
    },
  ],
  proposal: {
    taskPrompt: "Dịch sang tiếng Anh. Phải bao gồm chữ 'Banana'.",
    concurrencyLimit: 1,
    dataChunks: ["Trái cây: Táo, Chuối"],
    subteamConfig: {
      startAgentId: "worker_1",
      maxRetries: 2,
      agents: [
        {
          id: "worker_1",
          name: "Translator",
          role: "worker",
          systemPrompt:
            "Bạn là dịch giả. Quy tắc đặc biệt: Lần dịch ĐẦU TIÊN, BẠN PHẢI QUÊN DỊCH TỪ 'Chuối' (không có chữ Banana). Nếu được yêu cầu làm lại (lần thứ 2), bạn MỚI DỊCH ĐỦ CẢ 'Apple' và 'Banana'.",
          allowedSkills: [],
        },
        {
          id: "tester_1",
          name: "Reviewer",
          role: "tester",
          systemPrompt:
            "Kiểm tra xem bản dịch có chứa chữ 'Banana' không. Nếu KHÔNG có, trả lời NO và yêu cầu thêm Banana. Nếu CÓ chữ Banana, trả lời YES.",
          allowedSkills: [],
        },
      ],
      edges: [
        { from: "worker_1", to: "tester_1", condition: "always" },
        { from: "tester_1", to: "worker_1", condition: "on_reject" },
        { from: "tester_1", to: "END", condition: "on_success" },
      ],
    },
  },
};

async function run() {
  console.log("Bắt đầu chạy Graph test...");

  // Create output dir
  const outDir = path.join(process.cwd(), "dp_output");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  await orchestrator.executePlan(mockPlan, (p) => {
    // Do nothing on progress to avoid spam
  });

  const n = mockPlan.nodes[0];
  console.log("=== FINAL STATUS ===");
  console.log(n.status);
  console.log("=== LIVE OUTPUT LOG ===");
  console.log(n.liveOutput);

  const finalFile = path.join(outDir, `output_${n.id}.md`);
  if (fs.existsSync(finalFile)) {
    console.log("=== FINAL OUTPUT ===");
    console.log(fs.readFileSync(finalFile, "utf-8"));
  }
}

run().catch(console.error);
