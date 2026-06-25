package agent

import "strings"

type ProviderKind string

const (
	ProviderUnknown   ProviderKind = ""
	ProviderOpenAI    ProviderKind = "openai"
	ProviderAnthropic ProviderKind = "anthropic"
	ProviderDeepSeek  ProviderKind = "deepseek"
	ProviderGoogle    ProviderKind = "google"
)

const GeminiOpenAIBaseURL = "https://generativelanguage.googleapis.com/v1beta/openai/"

func ResolveProvider(provider, model, baseURL string) ProviderKind {
	normalized := strings.ToLower(strings.TrimSpace(provider))
	switch normalized {
	case "google", "gemini":
		return ProviderGoogle
	case "openai":
		return ProviderOpenAI
	case "anthropic":
		return ProviderAnthropic
	case "deepseek":
		return ProviderDeepSeek
	case "":
		break
	default:
		return ProviderKind(normalized)
	}

	lowerModel := strings.ToLower(strings.TrimSpace(model))
	lowerBaseURL := strings.ToLower(strings.TrimSpace(baseURL))

	if strings.HasPrefix(lowerModel, "gemini") || strings.Contains(lowerBaseURL, "generativelanguage.googleapis.com") {
		return ProviderGoogle
	}
	if strings.HasPrefix(lowerModel, "deepseek") {
		return ProviderDeepSeek
	}
	if strings.HasPrefix(lowerModel, "claude") {
		return ProviderAnthropic
	}
	return ProviderOpenAI
}

func DefaultBaseURL(provider ProviderKind) string {
	switch provider {
	case ProviderGoogle:
		return GeminiOpenAIBaseURL
	default:
		return ""
	}
}

func ResolveCredentials(provider ProviderKind, apiKey, baseURL, geminiApiKey, geminiBaseURL string) (string, string) {
	switch provider {
	case ProviderGoogle:
		if geminiApiKey != "" {
			apiKey = geminiApiKey
		}
		if geminiBaseURL != "" {
			baseURL = geminiBaseURL
		}
		if baseURL == "" {
			baseURL = GeminiOpenAIBaseURL
		}
	}
	return apiKey, baseURL
}

func ModelFamilyLabel(model string) string {
	lower := strings.ToLower(strings.TrimSpace(model))
	switch {
	case strings.HasPrefix(lower, "gemini"):
		return "Gemini"
	case strings.HasPrefix(lower, "deepseek"):
		return "DeepSeek"
	case strings.HasPrefix(lower, "claude"):
		return "Anthropic"
	case strings.HasPrefix(lower, "gpt-"):
		return "OpenAI"
	default:
		return "Unknown"
	}
}

func NormalizeReasoningEffort(provider ProviderKind, model string, thinkingEnabled bool, reasoningEffort string) string {
	effort := strings.ToLower(strings.TrimSpace(reasoningEffort))
	if effort == "-" {
		effort = ""
	}

	if thinkingEnabled {
		return effort
	}

	lowerModel := strings.ToLower(strings.TrimSpace(model))
	if provider == ProviderGoogle && strings.HasPrefix(lowerModel, "gemini-2.5") {
		return "none"
	}

	return ""
}

func CompactThreshold(model string, provider ProviderKind) int {
	lower := strings.ToLower(strings.TrimSpace(model))

	// Section-caching aware thresholds — push to 325K for supported models.
	// These models support prompt caching via <prompt_caching> markers,
	// so we can keep more history before compacting.
	switch {
	case strings.HasPrefix(lower, "gemini-3.1-pro-low"):
		return 32 * 1024
	case strings.HasPrefix(lower, "gemini-3.1-pro"):
		return 500 * 1024
	case strings.HasPrefix(lower, "gemini-v4-pro"):
		return 500 * 1024
	case strings.HasPrefix(lower, "gemini-2.5-"):
		return 325 * 1024 // 325K with section caching
	case strings.HasPrefix(lower, "gemini-3.5-"):
		return 325 * 1024
	case provider == ProviderGoogle:
		return 325 * 1024
	case strings.HasPrefix(lower, "deepseek-v4"):
		return 325 * 1024 // 325K with section caching + prompt caching
	case strings.HasPrefix(lower, "gpt-4") || strings.HasPrefix(lower, "o1") || strings.HasPrefix(lower, "o3"):
		return 325 * 1024
	case strings.HasPrefix(lower, "claude-3") || strings.HasPrefix(lower, "claude-4"):
		return 325 * 1024
	default:
		return 128 * 1024
	}
}
