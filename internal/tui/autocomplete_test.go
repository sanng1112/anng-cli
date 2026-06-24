package tui

import (
	"testing"
)

func TestAutocompleteSlash(t *testing.T) {
	items := []string{"/exit", "/new", "/resume", "/undo", "/mcp", "/settings"}
	matches := FilterAutocomplete(items, "/ex")
	if len(matches) != 1 || matches[0] != "/exit" {
		t.Errorf("Expected '/exit', got %v", matches)
	}
}
