package tools

import (
	"context"
	"testing"
)

func TestUpdatePlan(t *testing.T) {
	args := map[string]interface{}{
		"plan":        "Step 1: Go coding",
		"explanation": "Starting code changes",
	}
	res, err := UpdatePlanTool(context.Background(), args)
	if err != nil {
		t.Fatalf("Failed: %v", err)
	}
	if res != "Plan updated." {
		t.Errorf("Expected 'Plan updated.', got %q", res)
	}
}

func TestUpdatePlanMissingPlan(t *testing.T) {
	_, err := UpdatePlanTool(context.Background(), map[string]interface{}{})
	if err == nil {
		t.Error("Expected error for missing plan, got nil")
	}
}
