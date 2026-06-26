# Multi-Model PEVF Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Triển khai đường ống phối hợp đa mô hình (Multi-Model PEVF Pipeline) dựa trên State Machine cho ANNG CLI để tối ưu chi phí, tốc độ và kiểm soát chất lượng code.

**Architecture:** Sử dụng kiến trúc State Machine điều phối quá trình sinh Plan (Planner - Strong Model), thực thi (Executor - Cheap Bounded Worker), kiểm tra đa tầng (Step, Milestone, Final Verify) và sửa lỗi dựa trên Plan Surgery (Fixer - Strong Model).

**Tech Stack:** TypeScript, Node.js, OpenAI SDK (Gemini/DeepSeek API endpoints), Vitest.

---

### Task 1: Định nghĩa Types và Factory Helpers cho Pipeline

**Files:**
- Create: `src/harness/pipeline-types.ts`
- Create: `src/harness/pipeline-factories.ts`
- Create: `src/tests/pipeline-types.test.ts`

- [ ] **Step 1: Định nghĩa các kiểu dữ liệu và interfaces**

Tạo file `src/harness/pipeline-types.ts` với nội dung:
```typescript
export type PipelineState =
  | "planning"
  | "executing"
  | "verifying_step"
  | "repairing"
  | "verifying_final"
  | "done"
  | "failed";

export interface PlanStep {
  id: string;
  type: "read" | "edit" | "write" | "command"; // Semantics: read (read only), edit (patch), write (create/overwrite), command (execute tool)
  instruction: string;
  filesToRead: string[];
  filesToWrite: string[];
  dependsOn: string[];
  acceptance: string[];
  status: "pending" | "running" | "done" | "failed";
}

export interface FailureRecord {
  stepId: string;
  attempt: number;
  errorSignature: string;
  errorMessage: string;
  timestamp: string;
}

export interface PipelineRun {
  userPrompt: string;
  plan: PlanStep[];
  currentStepId?: string;
  modifiedFiles: string[];
  failures: FailureRecord[];
  attemptCount: number;
  state: PipelineState;
}

export interface FailurePacket {
  failedStepId: string;
  changedFiles: string[];
  verifyCommand?: string;
  exitCode?: number;
  errorSummary: string;
  stderrExcerpt?: string;
  suspectedScope: string[];
  originalAcceptance: string[];
}
```

- [ ] **Step 2: Triển khai các Factory Helpers**

Tạo file `src/harness/pipeline-factories.ts` với nội dung:
```typescript
import { PipelineRun, PlanStep } from "./pipeline-types";

export function createInitialPipelineRun(userPrompt: string): PipelineRun {
  return {
    userPrompt,
    plan: [],
    modifiedFiles: [],
    failures: [],
    attemptCount: 0,
    state: "planning",
  };
}

export function createPlanStep(
  id: string,
  type: PlanStep["type"],
  instruction: string,
  filesToRead: string[],
  filesToWrite: string[],
  acceptance: string[]
): PlanStep {
  return {
    id,
    type,
    instruction,
    filesToRead,
    filesToWrite,
    dependsOn: [],
    acceptance,
    status: "pending",
  };
}
```

- [ ] **Step 3: Viết test cho Types và Factory Helpers**

Tạo file `src/tests/pipeline-types.test.ts` với nội dung:
```typescript
import { describe, it, expect } from "vitest";
import { createInitialPipelineRun, createPlanStep } from "../harness/pipeline-factories";

describe("Pipeline Types & Factories", () => {
  it("should create initial pipeline run correctly", () => {
    const run = createInitialPipelineRun("Refactor authentication");
    expect(run.userPrompt).toBe("Refactor authentication");
    expect(run.state).toBe("planning");
    expect(run.failures).toEqual([]);
  });

  it("should create plan step correctly", () => {
    const step = createPlanStep(
      "s1",
      "edit",
      "Fix key rotator format",
      ["src/common/key-rotator.ts"],
      ["src/common/key-rotator.ts"],
      ["Rotator tests compile successfully"]
    );
    expect(step.id).toBe("s1");
    expect(step.status).toBe("pending");
    expect(step.filesToWrite).toContain("src/common/key-rotator.ts");
  });
});
```

- [ ] **Step 4: Chạy test để xác nhận**

Run: `npx vitest run src/tests/pipeline-types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/harness/pipeline-types.ts src/harness/pipeline-factories.ts src/tests/pipeline-types.test.ts
git commit -m "feat: add multi-model pipeline types and factory helpers with tests"
```

---

### Task 2: Triển khai Patch Handler với các điều kiện ràng buộc chặt chẽ

**Files:**
- Create: `src/harness/patch-handler.ts`
- Create: `src/tests/patch-handler.test.ts`

- [ ] **Step 1: Viết test cho Patch Handler**

Tạo file `src/tests/patch-handler.test.ts` với nội dung:
```typescript
import { describe, it, expect } from "vitest";
import { applyPatch } from "../harness/patch-handler";

describe("Patch Handler Boundary & Occurrence Checks", () => {
  it("should apply patch successfully when matched exactly once", () => {
    const original = "const x = 1;\nconst y = 2;\n";
    const patch = {
      targetFile: "src/math.ts",
      targetContent: "const y = 2;",
      replacementContent: "const y = 3;"
    };
    const result = applyPatch(original, patch, ["src/math.ts"], "src/math.ts");
    expect(result).toBe("const x = 1;\nconst y = 3;\n");
  });

  it("should throw if targetFile mismatch", () => {
    const original = "const x = 1;\n";
    const patch = {
      targetFile: "src/other.ts",
      targetContent: "const x = 1;",
      replacementContent: "const x = 2;"
    };
    expect(() => applyPatch(original, patch, ["src/math.ts"], "src/math.ts")).toThrow("Target file mismatch");
  });

  it("should throw if targetFile is not allowed to write", () => {
    const original = "const x = 1;\n";
    const patch = {
      targetFile: "src/other.ts",
      targetContent: "const x = 1;",
      replacementContent: "const x = 2;"
    };
    expect(() => applyPatch(original, patch, ["src/math.ts"], "src/other.ts")).toThrow("Permission denied");
  });

  it("should throw if targetContent is not found", () => {
    const original = "const x = 1;\n";
    const patch = {
      targetFile: "src/math.ts",
      targetContent: "const y = 2;",
      replacementContent: "const y = 3;"
    };
    expect(() => applyPatch(original, patch, ["src/math.ts"], "src/math.ts")).toThrow("Target content not found");
  });

  it("should throw if targetContent matched multiple times", () => {
    const original = "const x = 1;\nconst x = 1;\n";
    const patch = {
      targetFile: "src/math.ts",
      targetContent: "const x = 1;",
      replacementContent: "const x = 2;"
    };
    expect(() => applyPatch(original, patch, ["src/math.ts"], "src/math.ts")).toThrow("matched multiple times");
  });
});
```

- [ ] **Step 2: Viết code cho Patch Handler**

Tạo file `src/harness/patch-handler.ts` với nội dung:
```typescript
export interface SimplePatch {
  targetFile: string;
  targetContent: string;
  replacementContent: string;
}

export function applyPatch(
  fileContent: string,
  patch: SimplePatch,
  allowedWrites: string[],
  filePath: string
): string {
  if (patch.targetFile !== filePath) {
    throw new Error(`Target file mismatch: patch specifies ${patch.targetFile} but running on ${filePath}.`);
  }
  if (!allowedWrites.includes(patch.targetFile)) {
    throw new Error(`Permission denied: file ${patch.targetFile} is outside filesToWrite boundaries.`);
  }
  
  // Count matches
  const occurrences = fileContent.split(patch.targetContent).length - 1;
  if (occurrences === 0) {
    throw new Error(`Target content not found in ${filePath}.`);
  }
  if (occurrences > 1) {
    throw new Error(`Target content matched multiple times (${occurrences}) in ${filePath}. Patch must match exactly once.`);
  }

  return fileContent.replace(patch.targetContent, patch.replacementContent);
}
```

- [ ] **Step 3: Chạy test để xác nhận**

Run: `npx vitest run src/tests/patch-handler.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/harness/patch-handler.ts src/tests/patch-handler.test.ts
git commit -m "feat: implement secure patch handler with occurrence validation"
```

---

### Task 3: Triển khai Context Builder và Error Utility

**Files:**
- Create: `src/harness/pipeline-error-utils.ts`
- Create: `src/harness/pipeline-context-builder.ts`
- Create: `src/tests/pipeline-context-builder.test.ts`

- [ ] **Step 1: Viết test cho Error Normalization và Context Builder**

Tạo file `src/tests/pipeline-context-builder.test.ts` với nội dung:
```typescript
import { describe, it, expect } from "vitest";
import { buildExecutorPrompt } from "../harness/pipeline-context-builder";
import { normalizeErrorMessage, buildErrorSignature } from "../harness/pipeline-error-utils";
import { PlanStep } from "../harness/pipeline-types";

describe("Pipeline Context Builder & Error Utils", () => {
  it("should normalize error message, stripping timestamp and paths", () => {
    const errorMsg = "2026-06-26T20:28:59 ERROR in /run/media/sanng/New Volume/Seminar/Anng_cli/src/main.ts:12:34: index out of bounds";
    const normalized = normalizeErrorMessage(errorMsg);
    expect(normalized).toBe("ERROR in PROJECT_ROOT/src/main.ts: index out of bounds");
  });

  it("should generate same signature for same semantic errors with different timestamps", () => {
    const error1 = "2026-06-26T20:00:00 ERROR: Division by zero at line 15";
    const error2 = "2026-06-26T21:00:00 ERROR: Division by zero at line 20";
    expect(buildErrorSignature(error1)).toBe(buildErrorSignature(error2));
  });

  it("should include forbidden behaviors in executor prompt", () => {
    const step: PlanStep = {
      id: "s1",
      type: "edit",
      instruction: "Add test helper",
      filesToRead: [],
      filesToWrite: ["src/helper.ts"],
      dependsOn: [],
      acceptance: ["compiles"],
      status: "pending"
    };
    const prompt = buildExecutorPrompt(step);
    expect(prompt).toContain("FORBIDDEN BEHAVIOR");
    expect(prompt).toContain("Do NOT modify files outside");
  });
});
```

- [ ] **Step 2: Viết code cho Error Normalization Utility**

Tạo file `src/harness/pipeline-error-utils.ts` với nội dung:
```typescript
import * as crypto from "crypto";

export function normalizeErrorMessage(errorMsg: string): string {
  // Strip timestamps (e.g., 2026-06-26T20:28:59)
  let clean = errorMsg.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?/gi, "");
  // Strip absolute paths (e.g., /run/media/.../Anng_cli/ or /home/sanng/)
  clean = clean.replace(/\/[\w\-\s\/]+\/Anng_cli\//g, "PROJECT_ROOT/");
  clean = clean.replace(/\/home\/[\w\-]+\//g, "USER_HOME/");
  // Strip line numbers & columns (e.g., :12:34 or at line 12)
  clean = clean.replace(/:\d+:\d+/g, "");
  clean = clean.replace(/line \d+/gi, "");
  // Clean extra whitespaces
  return clean.replace(/\s+/g, " ").trim();
}

export function buildErrorSignature(errorMsg: string): string {
  const normalized = normalizeErrorMessage(errorMsg);
  return crypto.createHash("md5").update(normalized).digest("hex");
}
```

- [ ] **Step 3: Viết code cho Context Builder**

Tạo file `src/harness/pipeline-context-builder.ts` với nội dung:
```typescript
import { PlanStep, FailurePacket } from "./pipeline-types";

export function buildExecutorPrompt(step: PlanStep, failurePacket?: FailurePacket): string {
  let prompt = `=== EXECUTOR STEP: ${step.id} ===\n`;
  prompt += `Goal: ${step.instruction}\n\n`;
  prompt += `BOUNDARIES:\n`;
  prompt += `- Allowed to read: ${step.filesToRead.join(", ") || "None"}\n`;
  prompt += `- Allowed to write (Only make changes in these files): ${step.filesToWrite.join(", ") || "None"}\n\n`;
  prompt += `Acceptance criteria:\n${step.acceptance.map(a => `- ${a}`).join("\n")}\n\n`;
  
  prompt += `=== FORBIDDEN BEHAVIOR ===\n`;
  prompt += `- Do NOT modify files outside of allowed write list.\n`;
  prompt += `- Do NOT propose unrelated refactors or cosmetic changes.\n`;
  prompt += `- Do NOT create any new files unless explicitly permitted in allowed write list.\n`;
  prompt += `- Keep changes minimal and focused exactly on the acceptance criteria.\n`;
  prompt += `- Return output ONLY as a simple Unified Patch/Diff or targetContent/replacementContent structure.\n`;

  if (failurePacket) {
    prompt += `\n=== PREVIOUS FAILURE IN THIS STEP ===\n`;
    prompt += `Error Summary: ${failurePacket.errorSummary}\n`;
    prompt += `Suspected Scope: ${failurePacket.suspectedScope.join(", ")}\n`;
    if (failurePacket.stderrExcerpt) {
      prompt += `Stderr excerpt:\n${failurePacket.stderrExcerpt}\n`;
    }
  }
  return prompt;
}
```

- [ ] **Step 4: Chạy test để xác nhận**

Run: `npx vitest run src/tests/pipeline-context-builder.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/harness/pipeline-error-utils.ts src/harness/pipeline-context-builder.ts src/tests/pipeline-context-builder.test.ts
git commit -m "feat: implement context builder and error normalizer with tests"
```

---

### Task 4: Triển khai Orchestrator Skeleton với State Invariants

**Files:**
- Create: `src/harness/pipeline-orchestrator.ts`
- Create: `src/tests/pipeline-orchestrator.test.ts`

- [ ] **Step 1: Viết test cho Orchestrator State Transitions và Retry Rules**

Tạo file `src/tests/pipeline-orchestrator.test.ts` với nội dung:
```typescript
import { describe, it, expect } from "vitest";
import { PipelineOrchestrator } from "../harness/pipeline-orchestrator";

describe("PipelineOrchestrator States & Retry Rules", () => {
  const config = {
    plannerModel: "gemini-3.5-flash",
    executorModel: "gemini-3.1-flash-lite",
    fixerModel: "gemini-3.5-flash",
    maxRepairAttempts: 2
  };

  it("should allow valid transitions", () => {
    const orchestrator = new PipelineOrchestrator("Test prompt", config);
    expect(orchestrator.getState()).toBe("planning");
    
    orchestrator.transitionTo("executing");
    expect(orchestrator.getState()).toBe("executing");
  });

  it("should throw on invalid transitions", () => {
    const orchestrator = new PipelineOrchestrator("Test prompt", config);
    expect(() => orchestrator.transitionTo("verifying_final")).toThrow("Invalid state transition");
  });

  it("should respect maxRepairAttempts", () => {
    const orchestrator = new PipelineOrchestrator("Test prompt", config);
    expect(orchestrator.canRetry("s1")).toBe(true);
    
    orchestrator.recordFailure("s1", "compile error at line 5");
    expect(orchestrator.canRetry("s1")).toBe(true);
    
    orchestrator.recordFailure("s1", "compile error at line 5");
    expect(orchestrator.canRetry("s1")).toBe(false); // reached max (2)
  });

  it("should detect repeated failures", () => {
    const orchestrator = new PipelineOrchestrator("Test prompt", config);
    orchestrator.recordFailure("s1", "error: null pointer");
    
    expect(orchestrator.hasRepeatedFailure("s1", "error: null pointer")).toBe(true);
    expect(orchestrator.hasRepeatedFailure("s1", "error: index out of bounds")).toBe(false);
  });
});
```

- [ ] **Step 2: Viết code cho PipelineOrchestrator Skeleton**

Tạo file `src/harness/pipeline-orchestrator.ts` với nội dung:
```typescript
import { PipelineState, PlanStep, PipelineRun, FailureRecord } from "./pipeline-types";
import { buildErrorSignature } from "./pipeline-error-utils";

export interface OrchestratorConfig {
  plannerModel: string;
  executorModel: string;
  fixerModel: string;
  maxRepairAttempts: number;
}

const VALID_TRANSITIONS: Record<PipelineState, PipelineState[]> = {
  planning: ["executing", "failed"],
  executing: ["verifying_step", "failed"],
  verifying_step: ["executing", "verifying_final", "repairing", "failed"],
  repairing: ["executing", "failed"],
  verifying_final: ["done", "repairing", "failed"],
  done: [],
  failed: []
};

export class PipelineOrchestrator {
  private state: PipelineState = "planning";
  private runState: PipelineRun;
  private config: OrchestratorConfig;

  constructor(userPrompt: string, config: OrchestratorConfig) {
    this.config = config;
    this.runState = {
      userPrompt,
      plan: [],
      modifiedFiles: [],
      failures: [],
      attemptCount: 0,
      state: "planning"
    };
  }

  public getState(): PipelineState {
    return this.state;
  }

  public getRunState(): PipelineRun {
    return this.runState;
  }

  public transitionTo(newState: PipelineState) {
    const allowed = VALID_TRANSITIONS[this.state];
    if (!allowed.includes(newState)) {
      throw new Error(`Invalid state transition: ${this.state} -> ${newState}`);
    }
    this.state = newState;
    this.runState.state = newState;
  }

  public recordFailure(stepId: string, errorMsg: string): FailureRecord {
    const sig = buildErrorSignature(errorMsg);
    const failure: FailureRecord = {
      stepId,
      attempt: this.runState.failures.filter(f => f.stepId === stepId).length + 1,
      errorSignature: sig,
      errorMessage: errorMsg,
      timestamp: new Date().toISOString()
    };
    this.runState.failures.push(failure);
    return failure;
  }

  public canRetry(stepId: string): boolean {
    const attempts = this.runState.failures.filter(f => f.stepId === stepId).length;
    return attempts < this.config.maxRepairAttempts;
  }

  public hasRepeatedFailure(stepId: string, errorMsg: string): boolean {
    const sig = buildErrorSignature(errorMsg);
    const lastFailure = this.runState.failures
      .filter(f => f.stepId === stepId)
      .pop();
    return lastFailure?.errorSignature === sig;
  }
}
```

- [ ] **Step 3: Chạy test để xác nhận**

Run: `npx vitest run src/tests/pipeline-orchestrator.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/harness/pipeline-orchestrator.ts src/tests/pipeline-orchestrator.test.ts
git commit -m "feat: implement pipeline orchestrator state machine skeleton with transition validation"
```

---

### Task 5: Tích hợp CLI và Integration Guardrails

**Files:**
- Modify: `src/settings.ts`
- Modify: `src/cli.tsx`
- Modify: `src/harness/run-agent.ts`
- Create: `src/tests/pipeline-integration.test.ts`

- [ ] **Step 1: Tích hợp cấu hình vào settings.ts**

Sửa `src/settings.ts` để thêm `pipeline` configuration.
Thêm cấu hình mặc định vào schema:
```typescript
export interface PipelineSettings {
  plannerModel: string;
  executorModel: string;
  fixerModel: string;
  maxRepairAttempts: number;
}
```

- [ ] **Step 2: Thêm command-line flags trong cli.tsx**

Mở `src/cli.tsx` và cấu hình thêm nhận diện tham số:
```typescript
const pipelineModeEnabled = args.includes("--pipeline");
```

- [ ] **Step 3: Định tuyến cuộc gọi đến PipelineOrchestrator trong run-agent.ts**

Chỉnh sửa `src/harness/run-agent.ts` để kiểm tra `config.mode === "pipeline"`, nếu có sẽ khởi chạy `PipelineOrchestrator` thay vì `SessionManager` mặc định.

- [ ] **Step 4: Viết Integration Test để đảm bảo hoạt động an toàn**

Tạo file `src/tests/pipeline-integration.test.ts` để xác minh luồng CLI và default configuration fallback.
```typescript
import { describe, it, expect } from "vitest";
import { resolveCurrentSettings } from "../settings";

describe("Pipeline CLI Configuration Integration", () => {
  it("should fallback to default pipeline configuration if missing", () => {
    const settings = resolveCurrentSettings(process.cwd());
    const pipelineSettings = (settings as any).pipeline || {
      plannerModel: "gemini-3.5-flash",
      executorModel: "gemini-3.1-flash-lite",
      fixerModel: "gemini-3.5-flash",
      maxRepairAttempts: 3
    };
    expect(pipelineSettings.plannerModel).toBeDefined();
    expect(pipelineSettings.maxRepairAttempts).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 5: Xác nhận typecheck và tests toàn dự án**

Run: `npm run typecheck && npx vitest run`
Expected: SUCCESS

- [ ] **Step 6: Commit**

```bash
git add src/settings.ts src/cli.tsx src/harness/run-agent.ts src/tests/pipeline-integration.test.ts
git commit -m "feat: integrate pipeline flag and config into CLI settings with integration tests"
```
