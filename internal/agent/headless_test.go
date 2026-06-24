package agent

import (
	"context"
	"testing"
)

func TestHeadlessExecutionFlow(t *testing.T) {
	t.Setenv("ANNG_TEST", "true")
	res, err := RunHeadless(context.Background(), "refactor task", true)
	if err != nil {
		t.Fatalf("Headless execution failed: %v", err)
	}
	if res.FinishReason != "completed" {
		t.Errorf("Expected completed status, got %q", res.FinishReason)
	}
}
