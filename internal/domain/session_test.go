package domain

import (
	"testing"
)

func TestSessionCheckpoint(t *testing.T) {
	session := &Session{
		SessionID: "session-123",
		Messages: []Message{
			{Role: "user", Content: "Hello Agent"},
			{Role: "assistant", Content: "Hello User"},
		},
		Cwd: "/workspace",
	}

	data, err := session.Marshal()
	if err != nil {
		t.Fatalf("Marshal failed: %v", err)
	}

	loadedSession := &Session{}
	if err := loadedSession.Unmarshal(data); err != nil {
		t.Fatalf("Unmarshal failed: %v", err)
	}

	if loadedSession.SessionID != "session-123" {
		t.Errorf("Expected session-123, got %q", loadedSession.SessionID)
	}
	if len(loadedSession.Messages) != 2 {
		t.Errorf("Expected 2 messages, got %d", len(loadedSession.Messages))
	}
}
