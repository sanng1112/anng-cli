package tools

import (
	"context"
	"testing"
)

func TestToolRegistry(t *testing.T) {
	registry := NewToolRegistry()
	registry.Register("mock_tool", func(ctx context.Context, args map[string]interface{}) (string, error) {
		return "mocked result", nil
	})

	res, err := registry.Execute(context.Background(), "mock_tool", map[string]interface{}{})
	if err != nil {
		t.Fatalf("Execution failed: %v", err)
	}
	if res != "mocked result" {
		t.Errorf("Expected 'mocked result', got %q", res)
	}
}
