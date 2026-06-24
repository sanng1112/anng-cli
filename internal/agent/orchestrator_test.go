package agent

import (
	"context"
	"encoding/json"
	"testing"
)

func TestOrchestratorRun(t *testing.T) {
	orchestrator := NewOrchestrator("deepseek-v4", "mock-api-key")

	// Run with mock prompt — should succeed in mock mode
	result, err := orchestrator.Run(context.Background(), "Run command mock test")
	if err != nil {
		t.Fatalf("Orchestrator failed: %v", err)
	}

	if result.FinishReason != "completed" {
		t.Errorf("Expected completion, got %q", result.FinishReason)
	}
}

func TestOrchestratorArgumentParsing(t *testing.T) {
	orchestrator := NewOrchestrator("deepseek-v4", "mock-api-key")
	called := false
	orchestrator.RegisterTool("test_args", func(ctx context.Context, args map[string]interface{}) (string, error) {
		called = true
		if args["foo"] != "bar" {
			t.Errorf("Expected args['foo'] = 'bar', got %v", args["foo"])
		}
		return "ok", nil
	})

	tc := struct {
		Function struct {
			Name      string `json:"name"`
			Arguments string `json:"arguments"`
		} `json:"function"`
	}{}
	tc.Function.Name = "test_args"
	tc.Function.Arguments = `{"foo": "bar"}`

	handler, exists := orchestrator.ToolRegistry["test_args"]
	if !exists {
		t.Fatal("handler not found")
	}

	var parsedArgs map[string]interface{}
	if err := json.Unmarshal([]byte(tc.Function.Arguments), &parsedArgs); err != nil {
		t.Fatal(err)
	}

	res, err := handler(context.Background(), parsedArgs)
	if err != nil {
		t.Fatal(err)
	}
	if !called || res != "ok" {
		t.Error("Tool was not executed correctly")
	}
}

func TestStandardToolsRegistration(t *testing.T) {
	orchestrator := NewOrchestrator("deepseek-v4", "mock-api-key")
	standardTools := []string{
		"bash", "read", "write", "edit",
		"AskUserQuestion", "UpdatePlan",
		"WebSearch", "HttpRequest", "AnalyzeProject",
	}

	for _, tool := range standardTools {
		if _, exists := orchestrator.ToolRegistry[tool]; !exists {
			t.Errorf("Expected standard tool %q to be registered, but was not", tool)
		}
	}
}
