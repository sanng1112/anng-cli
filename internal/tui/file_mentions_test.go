package tui

import (
	"strings"
	"testing"
)

func TestGetFileMentions(t *testing.T) {
	matches := GetFileMentions(".", "ap")
	if len(matches) == 0 || !strings.Contains(matches[0], "app.go") {
		t.Errorf("GetFileMentions failed to list app.go file, matches: %v", matches)
	}
}
