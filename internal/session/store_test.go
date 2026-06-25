package session

import (
	"strings"
	"testing"
)

func newTestStore(t *testing.T) *SessionStore {
	t.Helper()

	homeDir := t.TempDir()
	projectRoot := t.TempDir()
	t.Setenv("HOME", homeDir)
	t.Setenv("USERPROFILE", homeDir)

	store, err := NewSessionStore(projectRoot)
	if err != nil {
		t.Fatalf("NewSessionStore failed: %v", err)
	}
	return store
}

func TestNewSessionStore(t *testing.T) {
	store := newTestStore(t)
	if store.baseDir == "" {
		t.Fatal("expected non-empty baseDir")
	}
}

func TestSaveAndListSessions(t *testing.T) {
	store := newTestStore(t)

	if err := store.SaveMessage("session-1", "user", "Hello"); err != nil {
		t.Fatalf("SaveMessage failed: %v", err)
	}
	if err := store.SaveMessage("session-1", "assistant", "Hi there!"); err != nil {
		t.Fatalf("SaveMessage failed: %v", err)
	}

	sessions, err := store.ListSessions()
	if err != nil {
		t.Fatalf("ListSessions failed: %v", err)
	}
	if len(sessions) != 1 {
		t.Fatalf("expected 1 session, got %d", len(sessions))
	}
	if sessions[0].ID != "session-1" {
		t.Fatalf("expected session-1, got %s", sessions[0].ID)
	}
	if sessions[0].MessageCount != 2 {
		t.Fatalf("expected 2 messages, got %d", sessions[0].MessageCount)
	}
}

func TestGetSession(t *testing.T) {
	store := newTestStore(t)
	if err := store.SaveMessage("session-2", "user", "Test"); err != nil {
		t.Fatalf("SaveMessage failed: %v", err)
	}
	if err := store.SaveMessage("session-2", "assistant", "Response"); err != nil {
		t.Fatalf("SaveMessage failed: %v", err)
	}

	msgs, err := store.GetSession("session-2")
	if err != nil {
		t.Fatalf("GetSession failed: %v", err)
	}
	if len(msgs) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(msgs))
	}
	if msgs[0].Role != "user" || msgs[0].Content != "Test" {
		t.Fatalf("unexpected first message: %+v", msgs[0])
	}
	if msgs[1].Role != "assistant" || msgs[1].Content != "Response" {
		t.Fatalf("unexpected second message: %+v", msgs[1])
	}
}

func TestCompactSession(t *testing.T) {
	store := newTestStore(t)

	for i := 0; i < 10; i++ {
		if err := store.SaveMessage("session-3", "user", "Message"); err != nil {
			t.Fatalf("SaveMessage failed: %v", err)
		}
		if err := store.SaveMessage("session-3", "assistant", "Response"); err != nil {
			t.Fatalf("SaveMessage failed: %v", err)
		}
	}

	if err := store.CompactSession("session-3", 6); err != nil {
		t.Fatalf("CompactSession failed: %v", err)
	}

	sessions, err := store.ListSessions()
	if err != nil {
		t.Fatalf("ListSessions failed: %v", err)
	}
	if sessions[0].MessageCount != 7 {
		t.Fatalf("expected 7 entries after compaction, got %d", sessions[0].MessageCount)
	}
}

func TestDeleteSession(t *testing.T) {
	store := newTestStore(t)
	if err := store.SaveMessage("session-del", "user", "Delete me"); err != nil {
		t.Fatalf("SaveMessage failed: %v", err)
	}

	if err := store.DeleteSession("session-del"); err != nil {
		t.Fatalf("DeleteSession failed: %v", err)
	}

	sessions, err := store.ListSessions()
	if err != nil {
		t.Fatalf("ListSessions failed: %v", err)
	}
	if len(sessions) != 0 {
		t.Fatalf("expected 0 sessions after delete, got %d", len(sessions))
	}
}

func TestCreateAndRestoreCheckpoint(t *testing.T) {
	store := newTestStore(t)

	if err := store.SaveMessage("session-cp", "user", "Initial message"); err != nil {
		t.Fatalf("SaveMessage failed: %v", err)
	}
	if err := store.SaveMessage("session-cp", "assistant", "Initial response"); err != nil {
		t.Fatalf("SaveMessage failed: %v", err)
	}

	if err := store.CreateCheckpoint("session-cp", "after-init"); err != nil {
		t.Fatalf("CreateCheckpoint failed: %v", err)
	}

	if err := store.SaveMessage("session-cp", "user", "Second message"); err != nil {
		t.Fatalf("SaveMessage failed: %v", err)
	}
	if err := store.SaveMessage("session-cp", "assistant", "Second response"); err != nil {
		t.Fatalf("SaveMessage failed: %v", err)
	}

	msgs, err := store.GetSession("session-cp")
	if err != nil {
		t.Fatalf("GetSession failed: %v", err)
	}
	if len(msgs) != 4 {
		t.Fatalf("expected 4 messages before restore, got %d", len(msgs))
	}

	if err := store.RestoreCheckpoint("session-cp", "after-init"); err != nil {
		t.Fatalf("RestoreCheckpoint failed: %v", err)
	}

	msgs, err = store.GetSession("session-cp")
	if err != nil {
		t.Fatalf("GetSession failed after restore: %v", err)
	}
	if len(msgs) != 2 {
		t.Fatalf("expected 2 messages after restore, got %d", len(msgs))
	}
}

func TestListCheckpoints(t *testing.T) {
	store := newTestStore(t)
	if err := store.SaveMessage("session-lc", "user", "hi"); err != nil {
		t.Fatalf("SaveMessage failed: %v", err)
	}
	if err := store.CreateCheckpoint("session-lc", "step-1"); err != nil {
		t.Fatalf("CreateCheckpoint failed: %v", err)
	}
	if err := store.SaveMessage("session-lc", "assistant", "hello"); err != nil {
		t.Fatalf("SaveMessage failed: %v", err)
	}
	if err := store.CreateCheckpoint("session-lc", "step-2"); err != nil {
		t.Fatalf("CreateCheckpoint failed: %v", err)
	}

	cps, err := store.ListCheckpoints("session-lc")
	if err != nil {
		t.Fatalf("ListCheckpoints failed: %v", err)
	}
	if len(cps) != 2 {
		t.Fatalf("expected 2 checkpoints, got %d: %v", len(cps), cps)
	}
}

func TestPreviewCapture(t *testing.T) {
	store := newTestStore(t)
	longText := strings.Repeat("hello world ", 20)
	if err := store.SaveMessage("session-prev", "user", longText); err != nil {
		t.Fatalf("SaveMessage failed: %v", err)
	}

	sessions, err := store.ListSessions()
	if err != nil {
		t.Fatalf("ListSessions failed: %v", err)
	}
	if len(sessions) != 1 {
		t.Fatal("expected 1 session")
	}
	if len(sessions[0].Preview) == 0 {
		t.Fatal("expected non-empty preview")
	}
	if len(sessions[0].Preview) > 100 {
		t.Fatalf("preview too long (%d chars)", len(sessions[0].Preview))
	}
}

func TestGetSessionNotFound(t *testing.T) {
	store := newTestStore(t)
	if _, err := store.GetSession("nonexistent"); err == nil {
		t.Fatal("expected error for nonexistent session")
	}
}
