package tools

import (
	"context"
	"testing"

	"anng-cli/internal/contextkeys"
)

func TestFileStateTracking(t *testing.T) {
	ctx := context.WithValue(context.Background(), contextkeys.SessionIDKey, "test-sess")
	RecordFileState(ctx, "/path/to/file", "hello world")

	state, ok := GetFileState(ctx, "/path/to/file")
	if !ok {
		t.Fatal("Expected state to exist")
	}
	if state.Content != "hello world" {
		t.Errorf("Expected content 'hello world', got %q", state.Content)
	}
}

func TestFileStateIsolation(t *testing.T) {
	ctx1 := context.WithValue(context.Background(), contextkeys.SessionIDKey, "sess-a")
	ctx2 := context.WithValue(context.Background(), contextkeys.SessionIDKey, "sess-b")

	RecordFileState(ctx1, "/shared/path", "session-a-content")
	RecordFileState(ctx2, "/shared/path", "session-b-content")

	s1, ok1 := GetFileState(ctx1, "/shared/path")
	s2, ok2 := GetFileState(ctx2, "/shared/path")

	if !ok1 || s1.Content != "session-a-content" {
		t.Errorf("Session A state mismatch: %v", s1)
	}
	if !ok2 || s2.Content != "session-b-content" {
		t.Errorf("Session B state mismatch: %v", s2)
	}
}
