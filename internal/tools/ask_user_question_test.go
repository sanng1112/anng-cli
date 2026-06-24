package tools

import (
	"context"
	"strings"
	"testing"
)

func TestAskUserQuestion(t *testing.T) {
	args := map[string]interface{}{
		"questions": []interface{}{
			map[string]interface{}{
				"question": "What flavor of tea?",
				"options": []interface{}{
					map[string]interface{}{"label": "Green"},
					map[string]interface{}{"label": "Black"},
				},
			},
		},
	}
	res, err := AskUserQuestionTool(context.Background(), args)
	if err != nil {
		t.Fatalf("Failed: %v", err)
	}
	if !strings.Contains(res, "Green") || !strings.Contains(res, "Black") {
		t.Errorf("Expected option labels in output, got: %q", res)
	}
	if !strings.Contains(res, "What flavor of tea?") {
		t.Errorf("Expected question text in output, got: %q", res)
	}
}

func TestAskUserQuestionMultiSelect(t *testing.T) {
	args := map[string]interface{}{
		"questions": []interface{}{
			map[string]interface{}{
				"question":    "Pick features",
				"multiSelect": true,
				"options": []interface{}{
					map[string]interface{}{"label": "Alpha", "description": "First feature"},
					map[string]interface{}{"label": "Beta"},
				},
			},
		},
	}
	res, err := AskUserQuestionTool(context.Background(), args)
	if err != nil {
		t.Fatalf("Failed: %v", err)
	}
	if !strings.Contains(res, "multi-select") {
		t.Errorf("Expected multi-select mode, got: %q", res)
	}
	if !strings.Contains(res, "First feature") {
		t.Errorf("Expected option description, got: %q", res)
	}
}

func TestAskUserQuestionEmpty(t *testing.T) {
	_, err := AskUserQuestionTool(context.Background(), map[string]interface{}{})
	if err == nil {
		t.Error("Expected error for empty questions, got nil")
	}
}
