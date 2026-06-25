package section

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

// Section represents a saved conversation segment for prompt caching.
// Sections are stored at ~/.anng/section/<sectionID>.json
type Section struct {
	ID        string    `json:"id"`
	SessionID string    `json:"sessionId"`
	CreatedAt time.Time `json:"createdAt"`
	TokenCost int       `json:"tokenCost"`
	Content   string    `json:"content"`
	Role      string    `json:"role"`
	Tags      []string  `json:"tags,omitempty"`
}

type SectionStore struct {
	baseDir string
}

func NewSectionStore() (*SectionStore, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("home dir: %w", err)
	}
	baseDir := filepath.Join(home, ".anng", "section")
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		return nil, fmt.Errorf("mkdir section: %w", err)
	}
	return &SectionStore{baseDir: baseDir}, nil
}

func (s *SectionStore) Save(section Section) error {
	if section.ID == "" {
		hash := sha256.Sum256([]byte(section.Content + time.Now().String()))
		section.ID = fmt.Sprintf("%x", hash[:8])
	}
	data, err := json.Marshal(section)
	if err != nil {
		return err
	}
	path := filepath.Join(s.baseDir, section.ID+".json")
	return os.WriteFile(path, data, 0644)
}

func (s *SectionStore) Load(id string) (*Section, error) {
	data, err := os.ReadFile(filepath.Join(s.baseDir, id+".json"))
	if err != nil {
		return nil, err
	}
	var sec Section
	if err := json.Unmarshal(data, &sec); err != nil {
		return nil, err
	}
	return &sec, nil
}

func (s *SectionStore) List(sessionID string) ([]Section, error) {
	entries, err := os.ReadDir(s.baseDir)
	if err != nil {
		if os.IsNotExist(err) { return nil, nil }
		return nil, err
	}
	var sections []Section
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(s.baseDir, e.Name()))
		if err != nil { continue }
		var sec Section
		if json.Unmarshal(data, &sec) != nil { continue }
		if sessionID != "" && sec.SessionID != sessionID { continue }
		sections = append(sections, sec)
	}
	sort.Slice(sections, func(i, j int) bool {
		return sections[i].CreatedAt.Before(sections[j].CreatedAt)
	})
	return sections, nil
}

func (s *SectionStore) Delete(id string) error {
	return os.Remove(filepath.Join(s.baseDir, id+".json"))
}

func (s *SectionStore) ClearSession(sessionID string) error {
	sections, err := s.List(sessionID)
	if err != nil { return err }
	for _, sec := range sections {
		_ = s.Delete(sec.ID)
	}
	return nil
}
