package tui

import (
	"testing"
)

func TestFormatHomeRelativePath(t *testing.T) {
	home := "/home/user"
	path := "/home/user/workspace/anng"
	res := FormatHomeRelativePath(path, home)
	expected := "~/workspace/anng"
	if res != expected {
		t.Errorf("Expected %q, got %q", expected, res)
	}
}
