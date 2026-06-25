package tools

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestReadURLContent(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte("<html><body><h1>Hello World</h1><p>Test content</p></body></html>"))
	}))
	defer ts.Close()

	markdown, err := ReadURLContent(context.Background(), ts.URL)
	if err != nil {
		t.Fatalf("Fetch failed: %v", err)
	}

	if !strings.Contains(markdown, "# Hello World") {
		t.Errorf("Expected markdown title translation, got: %q", markdown)
	}
}
