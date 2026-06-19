import { DpOrchestrator } from "./src/team/dp/orchestrator";
import { resolveCurrentSettings } from "./src/settings";

async function run() {
  console.log("Starting orchestrator...");
  const orchestrator = new DpOrchestrator();
  console.log("Calling generateProposal...");
  try {
    const proposal = await orchestrator.generateProposal("system", "Tạo 3 cốt truyện...");
    console.log("Result:", proposal);
  } catch (e) {
    console.error("Error:", e);
  }
}
run();
