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

func TestWordMovementAndDeletion(t *testing.T) {
	ib := NewInputBuffer()
	ib.Insert("hello world developer")

	// Move cursor to start of "world"
	ib.SetCursor(6)
	ib.MoveWordLeft()
	if ib.GetCursor() != 0 {
		t.Errorf("Expected cursor at 0, got %d", ib.GetCursor())
	}

	ib.SetCursor(6)
	ib.MoveWordRight()
	if ib.GetCursor() != 11 {
		t.Errorf("Expected cursor at 11, got %d", ib.GetCursor())
	}
}

func TestAdvancedInputBuffer(t *testing.T) {
	ib := NewInputBuffer()
	ib.Insert("hello")
	ib.PushUndo()
	ib.Insert(" world")
	
	if ib.GetText() != "hello world" {
		t.Fatalf("Insert failed: got %s", ib.GetText())
	}
	
	ib.Undo()
	if ib.GetText() != "hello" {
		t.Errorf("Undo failed: got %s", ib.GetText())
	}
	
	ib.Redo()
	if ib.GetText() != "hello world" {
		t.Errorf("Redo failed: got %s", ib.GetText())
	}
}

