package tui

import (
	"strings"
	"testing"
	"github.com/charmbracelet/lipgloss"
	"github.com/muesli/termenv"
)

func TestBrandThemeStyles(t *testing.T) {
	// Force color profile in tests
	lipgloss.SetColorProfile(termenv.TrueColor)

	text := "ANNG CLI"
	styled := ApplyOrangeColor(text)
	if !strings.Contains(styled, "\x1b[") {
		t.Errorf("Expected styled text to contain ANSI color escape sequences, got %q", styled)
	}

	mascotBorder := GetQuadrantBorder()
	if !strings.Contains(mascotBorder, "▄") && !strings.Contains(mascotBorder, "▀") {
		t.Errorf("Expected quadrant blocks in border frame, got %q", mascotBorder)
	}
}
