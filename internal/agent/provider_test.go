package agent

import "testing"

func TestResolveProvider(t *testing.T) {
	t.Run("infers google from model", func(t *testing.T) {
		if got := ResolveProvider("", "gemini-2.5-flash", ""); got != ProviderGoogle {
			t.Fatalf("expected google provider, got %q", got)
		}
	})

	t.Run("honors explicit provider", func(t *testing.T) {
		if got := ResolveProvider("deepseek", "gemini-2.5-flash", ""); got != ProviderDeepSeek {
			t.Fatalf("expected deepseek provider, got %q", got)
		}
	})

	t.Run("infers google from base url", func(t *testing.T) {
		if got := ResolveProvider("", "gpt-4o", GeminiOpenAIBaseURL); got != ProviderGoogle {
			t.Fatalf("expected google provider from base url, got %q", got)
		}
	})
}

func TestDefaultBaseURL(t *testing.T) {
	if got := DefaultBaseURL(ProviderGoogle); got != GeminiOpenAIBaseURL {
		t.Fatalf("expected Gemini OpenAI base URL, got %q", got)
	}
}

func TestResolveCredentials(t *testing.T) {
	apiKey, baseURL := ResolveCredentials(ProviderGoogle, "openai-key", "", "gemini-key", "")
	if apiKey != "gemini-key" {
		t.Fatalf("expected Gemini API key to win, got %q", apiKey)
	}
	if baseURL != GeminiOpenAIBaseURL {
		t.Fatalf("expected Gemini base URL fallback, got %q", baseURL)
	}
}

func TestNormalizeReasoningEffort(t *testing.T) {
	t.Run("disables thinking for Gemini 2.5", func(t *testing.T) {
		if got := NormalizeReasoningEffort(ProviderGoogle, "gemini-2.5-flash", false, "high"); got != "none" {
			t.Fatalf("expected none, got %q", got)
		}
	})

	t.Run("omits reasoning when thinking is disabled on Gemini 3", func(t *testing.T) {
		if got := NormalizeReasoningEffort(ProviderGoogle, "gemini-3.5-flash", false, "high"); got != "" {
			t.Fatalf("expected empty reasoning effort, got %q", got)
		}
	})

	t.Run("passes through enabled reasoning", func(t *testing.T) {
		if got := NormalizeReasoningEffort(ProviderGoogle, "gemini-3.5-flash", true, "medium"); got != "medium" {
			t.Fatalf("expected medium, got %q", got)
		}
	})
}

func TestCompactThreshold(t *testing.T) {
	if got := CompactThreshold("gemini-3.1-pro", ProviderGoogle); got < 128*1024 {
		t.Fatalf("expected a large Gemini threshold, got %d", got)
	}
	if got := CompactThreshold("deepseek-v4-pro", ProviderDeepSeek); got != 48*1024 {
		t.Fatalf("expected deepseek threshold, got %d", got)
	}
}
