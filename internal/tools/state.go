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
