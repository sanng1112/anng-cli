package tui

import (
	"strings"
	"testing"
)

func TestProcessStdoutTruncation(t *testing.T) {
	out := FormatStdoutBuffer("hello\nworld\nline3\n", 2)
	if strings.Contains(out, "hello") {
		t.Errorf("Expected first line to be truncated, got %q", out)
	}
}
