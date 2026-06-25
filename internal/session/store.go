package session

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// SessionInfo holds metadata about a saved session.
type SessionInfo struct {
	ID        string    `json:"id"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
	MessageCount int    `json:"messageCount"`
	Preview   string    `json:"preview"`
}

// SessionStore manages session persistence on disk.
type SessionStore struct {
	baseDir string
}

// NewSessionStore creates a store rooted at ~/.anng/projects/<projectCode>.
func NewSessionStore(projectRoot string) (*SessionStore, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("home dir: %w", err)
	}
	// Use SHA256 hash to avoid collisions between similar paths
	hash := sha256.Sum256([]byte(projectRoot))
	projectCode := fmt.Sprintf("%x", hash[:16])
	baseDir := filepath.Join(home, ".anng", "projects", projectCode)
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		return nil, fmt.Errorf("mkdir: %w", err)
	}
	return &SessionStore{baseDir: baseDir}, nil
}

// ListSessions returns all session infos sorted by UpdatedAt descending.
func (s *SessionStore) ListSessions() ([]SessionInfo, error) {
	entries, err := os.ReadDir(s.baseDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}

	var sessions []SessionInfo
	seen := make(map[string]bool)

	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		var sessionID string
		if strings.HasSuffix(name, ".jsonl") || strings.HasSuffix(name, ".json") {
			sessionID = strings.TrimSuffix(name, ".jsonl")
			sessionID = strings.TrimSuffix(sessionID, ".json")
		} else {
			continue
		}
		if sessionID == "sessions-index" || seen[sessionID] {
			continue
		}
		seen[sessionID] = true

		info, err := s.loadSessionInfo(sessionID)
		if err != nil {
			continue
		}
		sessions = append(sessions, info)
	}

	sort.Slice(sessions, func(i, j int) bool {
		return sessions[i].UpdatedAt.After(sessions[j].UpdatedAt)
	})
	return sessions, nil
}

// GetSession loads all messages for a session.
func (s *SessionStore) GetSession(sessionID string) ([]SessionMessage, error) {
	// Try JSONL first
	jsonlPath := filepath.Join(s.baseDir, sessionID+".jsonl")
	data, err := os.ReadFile(jsonlPath)
	if err == nil {
		return parseJSONLMessages(data)
	}

	// Try JSON
	jsonPath := filepath.Join(s.baseDir, sessionID+".json")
	data, err = os.ReadFile(jsonPath)
	if err != nil {
		return nil, fmt.Errorf("session %s not found", sessionID)
	}

	var container struct {
		Messages []SessionMessage `json:"messages"`
	}
	if err := json.Unmarshal(data, &container); err == nil {
		return container.Messages, nil
	}

	return nil, fmt.Errorf("session %s not found", sessionID)
}

// SessionMessage is a single message in a session.
type SessionMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// SaveMessage appends a message to the session's JSONL file.
func (s *SessionStore) SaveMessage(sessionID, role, content string) error {
	if sessionID == "" {
		return nil
	}
	msg := struct {
		Role       string    `json:"role"`
		Content    string    `json:"content"`
		CreateTime time.Time `json:"createTime"`
	}{
		Role:       role,
		Content:    content,
		CreateTime: time.Now(),
	}
	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	path := filepath.Join(s.baseDir, sessionID+".jsonl")
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	defer f.Close()

	_, err = f.Write(append(data, '\n'))
	return err
}

// CompactSession reduces older messages in a session file to keep only the most recent ones.
func (s *SessionStore) CompactSession(sessionID string, keepCount int) error {
	msgs, err := s.GetSession(sessionID)
	if err != nil {
		return err
	}
	if len(msgs) <= keepCount {
		return nil // nothing to compact
	}

	// Keep only the last keepCount messages
	msgs = msgs[len(msgs)-keepCount:]

	// Rewrite the session JSONL file with a compaction marker
	path := filepath.Join(s.baseDir, sessionID+".jsonl")
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()

	// Write a compaction notice as first message
	notice := struct {
		Role       string    `json:"role"`
		Content    string    `json:"content"`
		Compacted  bool      `json:"compacted"`
		CreateTime time.Time `json:"createTime"`
	}{
		Role:       "system",
		Content:    fmt.Sprintf("Session compacted: showing last %d of %d+ messages", keepCount, keepCount+1),
		Compacted:  true,
		CreateTime: time.Now(),
	}
	data, _ := json.Marshal(notice)
	f.Write(append(data, '\n'))

	for _, msg := range msgs {
		entry := struct {
			Role       string    `json:"role"`
			Content    string    `json:"content"`
			CreateTime time.Time `json:"createTime"`
		}{
			Role:       msg.Role,
			Content:    msg.Content,
			CreateTime: time.Now(),
		}
		data, _ := json.Marshal(entry)
		f.Write(append(data, '\n'))
	}

	return nil
}

// DeleteSession removes a session file.
func (s *SessionStore) DeleteSession(sessionID string) error {
	jsonlPath := filepath.Join(s.baseDir, sessionID+".jsonl")
	jsonPath := filepath.Join(s.baseDir, sessionID+".json")
	os.Remove(jsonlPath)
	os.Remove(jsonPath)
	return nil
}

// loadSessionInfo reads metadata from a session file without loading all content.
func (s *SessionStore) loadSessionInfo(sessionID string) (SessionInfo, error) {
	info := SessionInfo{ID: sessionID}

	jsonlPath := filepath.Join(s.baseDir, sessionID+".jsonl")
	stat, err := os.Stat(jsonlPath)
	if err != nil {
		jsonPath := filepath.Join(s.baseDir, sessionID+".json")
		stat, err = os.Stat(jsonPath)
		if err != nil {
			return info, err
		}
		info.UpdatedAt = stat.ModTime()
		// For JSON: load to count messages
		data, _ := os.ReadFile(jsonPath)
		var container struct{ Messages []SessionMessage }
		if json.Unmarshal(data, &container) == nil {
			info.MessageCount = len(container.Messages)
			if len(container.Messages) > 0 {
				info.Preview = truncateText(container.Messages[len(container.Messages)-1].Content, 80)
			}
		}
		return info, nil
	}

	info.UpdatedAt = stat.ModTime()

	data, _ := os.ReadFile(jsonlPath)
	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	info.MessageCount = len(lines)

	for i := len(lines) - 1; i >= 0; i-- {
		if strings.TrimSpace(lines[i]) == "" {
			continue
		}
		var msg struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		}
		if json.Unmarshal([]byte(lines[i]), &msg) == nil && msg.Content != "" {
			info.Preview = truncateText(msg.Content, 80)
			break
		}
	}

	return info, nil
}

// CreateCheckpoint saves a snapshot of the current session state.
func (s *SessionStore) CreateCheckpoint(sessionID string, label string) error {
	msgs, err := s.GetSession(sessionID)
	if err != nil {
		return err
	}
	data, err := json.Marshal(struct {
		Label    string           `json:"label"`
		Messages []SessionMessage `json:"messages"`
		Time     time.Time        `json:"time"`
	}{
		Label:    label,
		Messages: msgs,
		Time:     time.Now(),
	})
	if err != nil {
		return err
	}

	// Store checkpoints in a subdirectory
	checkDir := filepath.Join(s.baseDir, ".checkpoints")
	if err := os.MkdirAll(checkDir, 0755); err != nil {
		return fmt.Errorf("create checkpoint dir: %w", err)
	}

	safeLabel := strings.ReplaceAll(label, "/", "_")
	safeLabel = strings.ReplaceAll(safeLabel, " ", "_")
	cpPath := filepath.Join(checkDir, fmt.Sprintf("%s_%s.cp", sessionID, safeLabel))
	if err := os.WriteFile(cpPath, data, 0644); err != nil {
		return fmt.Errorf("write checkpoint: %w", err)
	}
	return nil
}

// ListCheckpoints returns all checkpoints for a session.
func (s *SessionStore) ListCheckpoints(sessionID string) ([]string, error) {
	checkDir := filepath.Join(s.baseDir, ".checkpoints")
	entries, err := os.ReadDir(checkDir)
	if err != nil {
		return nil, nil
	}
	var cps []string
	prefix := sessionID + "_"
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), prefix) && strings.HasSuffix(e.Name(), ".cp") {
			label := strings.TrimSuffix(strings.TrimPrefix(e.Name(), prefix), ".cp")
			// Try to read the checkpoint for its label
			data, _ := os.ReadFile(filepath.Join(checkDir, e.Name()))
			var ck struct {
				Label string `json:"label"`
			}
			if json.Unmarshal(data, &ck) == nil && ck.Label != "" {
				label = ck.Label
			}
			cps = append(cps, label)
		}
	}
	return cps, nil
}

// RestoreCheckpoint restores a session to a checkpoint state.
func (s *SessionStore) RestoreCheckpoint(sessionID string, label string) error {
	checkDir := filepath.Join(s.baseDir, ".checkpoints")
	safeLabel := strings.ReplaceAll(label, "/", "_")
	safeLabel = strings.ReplaceAll(safeLabel, " ", "_")
	cpPath := filepath.Join(checkDir, fmt.Sprintf("%s_%s.cp", sessionID, safeLabel))

	data, err := os.ReadFile(cpPath)
	if err != nil {
		return err
	}
	var ck struct {
		Messages []SessionMessage `json:"messages"`
	}
	if err := json.Unmarshal(data, &ck); err != nil {
		return err
	}

	// Overwrite the session file with checkpoint messages
	path := filepath.Join(s.baseDir, sessionID+".jsonl")
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()

	for _, msg := range ck.Messages {
		entry := struct {
			Role       string    `json:"role"`
			Content    string    `json:"content"`
			CreateTime time.Time `json:"createTime"`
		}{
			Role:       msg.Role,
			Content:    msg.Content,
			CreateTime: time.Now(),
		}
		data, _ := json.Marshal(entry)
		f.Write(append(data, '\n'))
	}

	return nil
}

func parseJSONLMessages(data []byte) ([]SessionMessage, error) {
	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	var msgs []SessionMessage
	for _, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}
		var msg SessionMessage
		if err := json.Unmarshal([]byte(line), &msg); err != nil {
			continue
		}
		msgs = append(msgs, msg)
	}
	return msgs, nil
}

func truncateText(s string, maxLen int) string {
	runes := []rune(s)
	if len(runes) <= maxLen {
		return s
	}
	return string(runes[:maxLen]) + "..."
}
