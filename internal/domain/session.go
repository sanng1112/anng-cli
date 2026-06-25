package domain

import (
	"encoding/json"
)

type Message struct {
	Role      string `json:"role"`
	Content   string `json:"content"`
	Compacted bool   `json:"compacted,omitempty"`
}

type Session struct {
	SessionID string    `json:"session_id"`
	Messages  []Message `json:"messages"`
	Cwd       string    `json:"cwd"`
}

func (s *Session) Marshal() ([]byte, error) {
	return json.Marshal(s)
}

func (s *Session) Unmarshal(data []byte) error {
	return json.Unmarshal(data, s)
}
