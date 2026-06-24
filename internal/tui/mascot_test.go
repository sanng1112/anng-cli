package tui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/lipgloss"
	"github.com/muesli/termenv"
)

func TestRenderMascot(t *testing.T) {
	lipgloss.SetColorProfile(termenv.TrueColor)
	mascot := RenderMascot(80)
	if !strings.Contains(mascot, "▀") && !strings.Contains(mascot, "▄") {
		t.Errorf("Expected mascot output to contain block characters, got: %s", mascot)
	}
	if !strings.Contains(mascot, "\x1b[") {
		t.Errorf("Expected ANSI color escape sequences in mascot")
	}
}
