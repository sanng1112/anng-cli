package agent

import (
	"context"
	"encoding/json"
	"testing"
)

func TestOrchestratorRun(t *testing.T) {
	orchestrator := NewOrchestrator("deepseek-v4", "mock-api-key", "act")

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
	orchestrator := NewOrchestrator("deepseek-v4", "mock-api-key", "act")
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
	orchestrator := NewOrchestrator("deepseek-v4", "mock-api-key", "act")
	standardTools := []string{
		"read_file", "write_to_file", "replace_file_content", "multi_replace_file_content", "ask_question", "UpdatePlan", "search_web", "HttpRequest", "AnalyzeProject",
	}

	for _, tool := range standardTools {
		if _, exists := orchestrator.ToolRegistry[tool]; !exists {
			t.Errorf("Expected standard tool %q to be registered, but was not", tool)
		}
	}
}

func TestAutoCorrectiveLoopOnCompileError(t *testing.T) {
	orchestrator := NewOrchestrator("deepseek-chat", "mock-key", "act")
	orchestrator.BaseURL = "mock-url"

	// Mock register bash tool
	orchestrator.RegisterTool("bash", func(ctx context.Context, args map[string]interface{}) (string, error) {
		return "exit status 1: main.go:10: syntax error: unexpected semicolon", nil
	})

	shouldCorrect := orchestrator.checkForCompilerErrors("exit status 1: main.go:10: syntax error: unexpected semicolon")
	if !shouldCorrect {
		t.Error("Expected checkForCompilerErrors to return true for syntax error stack trace")
	}

	shouldNotCorrect := orchestrator.checkForCompilerErrors("hello world no error")
	if shouldNotCorrect {
		t.Error("Expected checkForCompilerErrors to return false for regular output")
	}
}

func TestPolicyDeniesMutatingToolsInPlanMode(t *testing.T) {
	ctx := NewExecutionContext(ExecutionContextOptions{
		SessionID:     "session-1",
		WorkspaceRoot: "/tmp/project",
		Mode:          ModePlan,
	})

	if err := EvaluateToolCall(ctx, "write_to_file", map[string]interface{}{"file_path": "a.txt"}); err == nil {
		t.Fatal("expected write_to_file to be denied in plan mode")
	}
}

func TestPolicyAllowsReadInPlanMode(t *testing.T) {
	ctx := NewExecutionContext(ExecutionContextOptions{
		SessionID:     "session-1",
		WorkspaceRoot: "/tmp/project",
		Mode:          ModePlan,
	})

	if err := EvaluateToolCall(ctx, "read_file", map[string]interface{}{"file_path": "a.txt"}); err != nil {
		t.Fatalf("expected read_file to be allowed: %v", err)
	}
}

func TestRegisteredToolSchemasMatchRuntimeHandlers(t *testing.T) {
	orch := NewOrchestrator("gpt-4o", "mock-key", "act")
	schemas := toolSpecs()

	for _, schema := range schemas {
		if _, ok := orch.ToolRegistry[schema.Function.Name]; !ok {
			t.Fatalf("tool schema %q has no runtime handler", schema.Function.Name)
		}
	}
}

func TestInvariantPlanModeBlocksMutations(t *testing.T) {
	TestPolicyDeniesMutatingToolsInPlanMode(t)
}

func TestInvariantToolSchemasMatchHandlers(t *testing.T) {
	TestRegisteredToolSchemasMatchRuntimeHandlers(t)
}
