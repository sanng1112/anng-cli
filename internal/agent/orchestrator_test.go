package agent

import (
	"context"
	"testing"
)

func TestOrchestratorRun(t *testing.T) {
	orchestrator := NewOrchestrator("deepseek-v4", "mock-api-key")
	orchestrator.RegisterTool("bash", func(ctx context.Context, args map[string]interface{}) (string, error) {
		return "Mock shell success", nil
	})

	// Run with mock prompt
	result, err := orchestrator.Run(context.Background(), "Run command mock test")
	if err != nil {
		t.Fatalf("Orchestrator failed: %v", err)
	}

	if result.FinishReason != "completed" {
		t.Errorf("Expected completion, got %q", result.FinishReason)
	}
}
