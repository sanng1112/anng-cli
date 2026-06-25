package tools

import (
	"context"
	"sync"
	"time"

	"anng-cli/internal/contextkeys"
)

// FileState holds the cached content of a file per session.
type FileState struct {
	FilePath  string
	Content   string
	Timestamp time.Time
}

var (
	stateMutex sync.Mutex
	fileStates = make(map[string]map[string]FileState)
)

const maxSessionStates = 100 // Maximum number of sessions to track simultaneously

func getSessionID(ctx context.Context) string {
	if val, ok := ctx.Value(contextkeys.SessionIDKey).(string); ok {
		return val
	}
	return "default"
}

// RecordFileState stores the content of a file for a given session.
func RecordFileState(ctx context.Context, filePath string, content string) {
	stateMutex.Lock()
	defer stateMutex.Unlock()
	sessID := getSessionID(ctx)
	if _, ok := fileStates[sessID]; !ok {
		// Enforce capacity limit to prevent memory leak
		if len(fileStates) >= maxSessionStates {
			// Remove oldest session
			var oldestKey string
			var oldestTime time.Time
			for k, v := range fileStates {
				var sessionOldest time.Time
				for _, fs := range v {
					if sessionOldest.IsZero() || fs.Timestamp.Before(sessionOldest) {
						sessionOldest = fs.Timestamp
					}
				}
				if oldestKey == "" || sessionOldest.Before(oldestTime) {
					oldestKey = k
					oldestTime = sessionOldest
				}
			}
			delete(fileStates, oldestKey)
		}
		fileStates[sessID] = make(map[string]FileState)
	}
	fileStates[sessID][filePath] = FileState{
		FilePath:  filePath,
		Content:   content,
		Timestamp: time.Now(),
	}
}

// GetFileState retrieves the cached state of a file for the current session.
func GetFileState(ctx context.Context, filePath string) (FileState, bool) {
	stateMutex.Lock()
	defer stateMutex.Unlock()
	sessID := getSessionID(ctx)
	sess, ok := fileStates[sessID]
	if !ok {
		return FileState{}, false
	}
	fs, ok := sess[filePath]
	return fs, ok
}

// ClearSessionStates removes all tracked file states for the given session.
// Call this when a session ends to free memory.
func ClearSessionStates(sessionID string) {
	stateMutex.Lock()
	defer stateMutex.Unlock()
	delete(fileStates, sessionID)
}
