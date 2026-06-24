package tui

import (
	"testing"
)

func TestInputBufferEdit(t *testing.T) {
	buf := NewInputBuffer()
	buf.Insert("hello world")

	if buf.GetText() != "hello world" {
		t.Errorf("Expected 'hello world', got %q", buf.GetText())
	}

	buf.MoveWordLeft()
	buf.Insert("beautiful ")

	if buf.GetText() != "hello beautiful world" {
		t.Errorf("Expected text to insert, got %q", buf.GetText())
	}

	buf.DeleteWordBefore()
	if buf.GetText() != "hello world" {
		t.Errorf("Expected deleted word, got %q", buf.GetText())
	}
}
