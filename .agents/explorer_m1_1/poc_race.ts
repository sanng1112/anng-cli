import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import assert from "assert";
import { SessionManager, globalFileWriteQueue } from "../../src/session/index.js";

// Helper to create a temp directory
function createTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return dir;
}

async function runPoC() {
  console.log("=== ANNG-CLI Race Condition, Data Loss, & Cache Pollution PoC ===");

  const workspace = createTempDir("anng-poc-workspace-");
  const home = createTempDir("anng-poc-home-");

  // Mock home directory
  process.env.HOME = home;
  if (process.platform === "win32") {
    process.env.USERPROFILE = home;
  }

  // 1. Instantiate SessionManager and create a session
  console.log("\n[1] Creating first SessionManager instance (manager1) and initiating a session...");
  const manager1 = new SessionManager({
    projectRoot: workspace,
    createOpenAIClient: () => ({
      client: null,
      model: "test-model",
      thinkingEnabled: false,
    }),
    getResolvedSettings: () => ({ model: "test-model" }),
    onAssistantMessage: () => {},
  });

  const sessionId = await manager1.createSession({ text: "Hello ANNG" });
  console.log(`Session created with ID: ${sessionId}`);

  // 2. Immediately instantiate a second SessionManager and list messages
  // This simulates a CLI restart or session reload while the async write is still in the queue.
  console.log("\n[2] Instantiating manager2 immediately (simulating immediate query/reload)...");
  const manager2 = new SessionManager({
    projectRoot: workspace,
    createOpenAIClient: () => ({
      client: null,
      model: "test-model",
      thinkingEnabled: false,
    }),
    getResolvedSettings: () => ({ model: "test-model" }),
    onAssistantMessage: () => {},
  });

  console.log("Reading messages via manager2.listSessionMessages() immediately...");
  const messagesImmediate = manager2.listSessionMessages(sessionId);
  console.log(`Messages found immediately: ${messagesImmediate.length}`);
  
  // Verify that the race condition occurs: since the write is asynchronous and queued,
  // the file read synchronously via fs.readFileSync returns empty/nothing!
  console.log(`Bypass check: Is message list empty? ${messagesImmediate.length === 0}`);
  
  // 3. Check file existence on disk directly
  const messagesPath = (manager1 as any).getSessionMessagesPath(sessionId);
  const existsBefore = fs.existsSync(messagesPath);
  console.log(`File exists on disk immediately after save? ${existsBefore}`);

  // 4. Now await the file write queue to finish
  console.log("\n[3] Awaiting the global file write queue to complete write operations...");
  await globalFileWriteQueue.awaitIdle();
  console.log("Queue idle.");

  // 5. Query manager2 again (this shows Cache Pollution)
  console.log("\n[4] Querying manager2 again...");
  const messagesAfterManager2 = manager2.listSessionMessages(sessionId);
  console.log(`Messages found by manager2: ${messagesAfterManager2.length} (Expected 0 due to Cache Pollution)`);

  // 6. Query a new manager3 (this shows clean read from disk after write finishes)
  console.log("\n[5] Instantiating manager3 (clean instance)...");
  const manager3 = new SessionManager({
    projectRoot: workspace,
    createOpenAIClient: () => ({
      client: null,
      model: "test-model",
      thinkingEnabled: false,
    }),
    getResolvedSettings: () => ({ model: "test-model" }),
    onAssistantMessage: () => {},
  });
  
  const messagesAfterManager3 = manager3.listSessionMessages(sessionId);
  console.log(`Messages found by manager3: ${messagesAfterManager3.length} (Expected 4)`);

  // Clean up
  fs.rmSync(workspace, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });

  console.log("\n=== PoC Conclusion ===");
  if (messagesImmediate.length === 0 && messagesAfterManager2.length === 0 && messagesAfterManager3.length === 4) {
    console.log("SUCCESS: Programmatically reproduced the race condition AND cache pollution bugs!");
  } else {
    console.log("FAILURE: Could not reproduce.");
  }
}

runPoC().catch(console.error);
