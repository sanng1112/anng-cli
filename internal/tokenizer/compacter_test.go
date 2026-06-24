package tokenizer

import (
	"testing"
)

func TestShouldCompact(t *testing.T) {
	messages := []Message{
		{Role: "system", Content: "Important rules"},
		{Role: "user", Content: "Write some code"},
		{Role: "assistant", Content: "Very long code payload that exceeds the normal threshold limits of standard token metrics"},
	}

	// High threshold: should not compact
	decision := ShouldCompactContext(messages, 500)
	if decision.ShouldCompact {
		t.Errorf("Expected should not compact for high threshold")
	}

	// Low threshold: should compact
	decisionLow := ShouldCompactContext(messages, 20)
	if !decisionLow.ShouldCompact {
		t.Errorf("Expected should compact for low threshold")
	}
	if decisionLow.CompactUpToIndex != 1 {
		t.Errorf("Expected CompactUpToIndex to be 1, got %d", decisionLow.CompactUpToIndex)
	}
}
