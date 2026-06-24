package tools

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestWebSearchTool(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"result": "mock search result details"}`))
	}))
	defer ts.Close()

	// Override the default URL to point to our mock server
	original := DefaultWebSearchAPIURL
	DefaultWebSearchAPIURL = ts.URL
	defer func() { DefaultWebSearchAPIURL = original }()

	args := map[string]interface{}{
		"query": "test query string",
	}

	res, err := WebSearchTool(context.Background(), args)
	if err != nil {
		t.Fatalf("Search failed: %v", err)
	}

	if !strings.Contains(res, "mock search result details") {
		t.Errorf("Expected search results, got %q", res)
	}
}

func TestWebSearchToolMissingQuery(t *testing.T) {
	_, err := WebSearchTool(context.Background(), map[string]interface{}{})
	if err == nil {
		t.Error("Expected error for missing query, got nil")
	}
}
