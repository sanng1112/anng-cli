package section

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

var logLocks sync.Mutex

func lockLog()    { logLocks.Lock() }
func unlockLog()  { logLocks.Unlock() }

func atomicWrite(path string, data []byte) error {
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0644); err != nil { return err }
	return os.Rename(tmp, path)
}

// ReadLog tracks which sections have been sent to the LLM for prompt caching.
// When a section is "read", its content is considered cached by the provider.
// Subsequent requests can reference the cache with <prompt_caching> markers.

type ReadLogEntry struct {
	SectionID string    `json:"sectionId"`
	AgentID   string    `json:"agentId,omitempty"` // which agent read this
	ReadAt    time.Time `json:"readAt"`
	Role      string    `json:"role"`
	Length    int       `json:"length"`
	CacheKey  string    `json:"cacheKey"`
}

type ReadLog struct {
	SessionID string         `json:"sessionId"`
	Entries   []ReadLogEntry `json:"entries"`
}

type ReadLogStore struct {
	baseDir string
}

func NewReadLogStore() (*ReadLogStore, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("home dir: %w", err)
	}
	baseDir := filepath.Join(home, ".anng", "section")
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		return nil, fmt.Errorf("mkdir: %w", err)
	}
	return &ReadLogStore{baseDir: baseDir}, nil
}

func (r *ReadLogStore) logPath(sessionID string) string {
	return filepath.Join(r.baseDir, "_readlog_"+sessionID+".json")
}

func (r *ReadLogStore) Load(sessionID string) (*ReadLog, error) {
	data, err := os.ReadFile(r.logPath(sessionID))
	if err != nil {
		if os.IsNotExist(err) {
			return &ReadLog{SessionID: sessionID}, nil
		}
		return nil, err
	}
	var log ReadLog
	if err := json.Unmarshal(data, &log); err != nil {
		return &ReadLog{SessionID: sessionID}, nil
	}
	return &log, nil
}

func (r *ReadLogStore) Append(sessionID, sectionID, agentID, role string, length int) error {
	lockLog()
	defer unlockLog()

	log, err := r.Load(sessionID)
	if err != nil {
		log = &ReadLog{SessionID: sessionID}
	}
	log.Entries = append(log.Entries, ReadLogEntry{
		SectionID: sectionID,
		AgentID:   agentID,
		ReadAt:    time.Now(),
		Role:      role,
		Length:    length,
		CacheKey:  cacheKeyFor(sessionID, sectionID, agentID),
	})
	return r.saveLocked(log)
}

func (r *ReadLogStore) MarkRead(sessionID, sectionID, agentID, role string, length int) error {
	lockLog()
	defer unlockLog()

	log, err := r.Load(sessionID)
	if err != nil {
		log = &ReadLog{SessionID: sessionID}
	}
	for i, e := range log.Entries {
		if e.SectionID == sectionID && e.AgentID == agentID {
			log.Entries[i].ReadAt = time.Now()
			log.Entries[i].Length = length
			log.Entries[i].CacheKey = cacheKeyFor(sessionID, sectionID, agentID)
			return r.saveLocked(log)
		}
	}
	log.Entries = append(log.Entries, ReadLogEntry{
		SectionID: sectionID, AgentID: agentID,
		ReadAt: time.Now(), Role: role, Length: length,
		CacheKey: cacheKeyFor(sessionID, sectionID, agentID),
	})
	return r.saveLocked(log)
}

func (r *ReadLogStore) saveLocked(log *ReadLog) error {
	data, err := json.MarshalIndent(log, "", "  ")
	if err != nil { return err }
	return atomicWrite(r.logPath(log.SessionID), data)
}

func cacheKeyFor(sessionID, sectionID, agentID string) string {
	s := sessionID; if len(s) > 8 { s = s[:8] }
	sec := sectionID; if len(sec) > 8 { sec = sec[:8] }
	a := agentID; if a == "" { a = "main" }; if len(a) > 6 { a = a[:6] }
	return fmt.Sprintf("sec_%s_%s_%s", s, sec, a)
}

func (r *ReadLogStore) AgentReadSections(sessionID, agentID string) ([]ReadLogEntry, error) {
	log, err := r.Load(sessionID)
	if err != nil { return nil, err }
	var out []ReadLogEntry
	for _, e := range log.Entries {
		if e.AgentID == agentID { out = append(out, e) }
	}
	return out, nil
}

// CachedSectionKeys returns a list of cache keys that should still be valid.
// Entries older than 5 minutes are considered expired (provider cache TTL).
func (r *ReadLogStore) CachedSectionKeys(sessionID string, maxAge time.Duration) ([]string, error) {
	log, err := r.Load(sessionID)
	if err != nil {
		return nil, err
	}
	cutoff := time.Now().Add(-maxAge)
	var keys []string
	for _, e := range log.Entries {
		if e.ReadAt.After(cutoff) {
			keys = append(keys, e.CacheKey)
		}
	}
	return keys, nil
}

// BuildPromptWithCache builds a prompt string with <prompt_caching> markers
// for sections that are likely cached by the provider.
func BuildPromptWithCache(sessionID string, sections []Section, activeContent string) string {
	var sb strings.Builder
	sb.WriteString("<prompt_caching>\n")
	for _, sec := range sections {
		cacheKey := fmt.Sprintf("sec_%s_%s", sessionID[:min(8, len(sessionID))], sec.ID[:min(8, len(sec.ID))])
		sb.WriteString(fmt.Sprintf("<cache key=\"%s\">\n", cacheKey))
		sb.WriteString(sec.Content)
		sb.WriteString("\n</cache>\n")
	}
	sb.WriteString("</prompt_caching>\n")
	sb.WriteString("<active_context>\n")
	sb.WriteString(activeContent)
	sb.WriteString("\n</active_context>")
	return sb.String()
}
