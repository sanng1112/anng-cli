export interface TelemetryReport {
  plannerParseSuccesses: number;
  plannerParseFailures: number;
  plannerSemanticFailures: number;
  executorParseSuccesses: number;
  executorParseFailures: number;
  executorSemanticFailures: number;
  tokensUsed: {
    promptTokens: number;
    completionTokens: number;
  };
  totalRequests: number;
  retries: number;
}

export class PipelineTelemetry {
  private report: TelemetryReport = {
    plannerParseSuccesses: 0,
    plannerParseFailures: 0,
    plannerSemanticFailures: 0,
    executorParseSuccesses: 0,
    executorParseFailures: 0,
    executorSemanticFailures: 0,
    tokensUsed: {
      promptTokens: 0,
      completionTokens: 0,
    },
    totalRequests: 0,
    retries: 0,
  };

  public recordPlannerParse(success: boolean): void {
    if (success) {
      this.report.plannerParseSuccesses++;
    } else {
      this.report.plannerParseFailures++;
    }
    this.report.totalRequests++;
  }

  public recordPlannerSemanticFailure(): void {
    this.report.plannerSemanticFailures++;
  }

  public recordExecutorParse(success: boolean): void {
    if (success) {
      this.report.executorParseSuccesses++;
    } else {
      this.report.executorParseFailures++;
    }
    this.report.totalRequests++;
  }

  public recordExecutorSemanticFailure(): void {
    this.report.executorSemanticFailures++;
  }

  public recordTokens(prompt: number, completion: number): void {
    this.report.tokensUsed.promptTokens += prompt;
    this.report.tokensUsed.completionTokens += completion;
  }

  public recordRetry(): void {
    this.report.retries++;
  }

  public getReport(): TelemetryReport {
    return { ...this.report, tokensUsed: { ...this.report.tokensUsed } };
  }

  public printSummary(): string {
    const r = this.report;
    const plannerSuccessRate =
      r.plannerParseSuccesses + r.plannerParseFailures === 0
        ? 100
        : Math.round((r.plannerParseSuccesses / (r.plannerParseSuccesses + r.plannerParseFailures)) * 100);

    const executorSuccessRate =
      r.executorParseSuccesses + r.executorParseFailures === 0
        ? 100
        : Math.round((r.executorParseSuccesses / (r.executorParseSuccesses + r.executorParseFailures)) * 100);

    return `
================= Pipeline Telemetry Summary =================
Total LLM Requests: ${r.totalRequests}
Tokens Used:
  - Input (Prompt):     ${r.tokensUsed.promptTokens}
  - Output (Completion): ${r.tokensUsed.completionTokens}

Planner Stats:
  - Parse Success Rate:  ${plannerSuccessRate}% (${r.plannerParseSuccesses}/${r.plannerParseSuccesses + r.plannerParseFailures})
  - Semantic Violations: ${r.plannerSemanticFailures}

Executor Stats:
  - Parse Success Rate:  ${executorSuccessRate}% (${r.executorParseSuccesses}/${r.executorParseSuccesses + r.executorParseFailures})
  - Semantic Violations: ${r.executorSemanticFailures}

Execution Retries: ${r.retries}
==============================================================
`.trim();
  }
}
