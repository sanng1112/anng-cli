package tokenizer

import (
	"unicode"
)

type Message struct {
	Role      string
	Content   string
	Compacted bool
}

type CompactionDecision struct {
	ShouldCompact    bool
	EstimatedTokens  int
	CompactUpToIndex int
	KeepFromIndex    int
}

// EstimateTokens calculates tokens with adjustments for different character types.
// Uses empirical ratios: ~0.25 tokens/char for ASCII, ~0.35 for extended Latin,
// ~0.5 for numbers/symbols, ~1.5 for CJK, ~0.1 for whitespace.
func EstimateTokens(content string) int {
	var total float64
	for _, r := range content {
		switch {
		case r == ' ' || r == '\t' || r == '\n' || r == '\r':
			total += 0.1
		case r >= '0' && r <= '9':
			total += 0.5
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z':
			total += 0.25
		case r >= 0xC0 && r <= 0x024F: // Extended Latin
			total += 0.35
		case unicode.Is(unicode.Han, r) || unicode.In(r, unicode.Hiragana, unicode.Katakana, unicode.Hangul):
			total += 1.5
		default:
			total += 0.45
		}
	}
	if total < 1 {
		total = 1
	}
	return int(total)
}

func ShouldCompactContext(messages []Message, threshold int) CompactionDecision {
	var activeMessages []Message
	var originalIndices []int
	for idx, m := range messages {
		if !m.Compacted {
			activeMessages = append(activeMessages, m)
			originalIndices = append(originalIndices, idx)
		}
	}

	var totalTokens int
	for _, m := range activeMessages {
		totalTokens += EstimateTokens(m.Content)
	}

	if totalTokens < threshold {
		return CompactionDecision{ShouldCompact: false, EstimatedTokens: totalTokens}
	}

	targetKeepTokens := int(float64(threshold) * 0.6)
	keptTokens := 0
	boundaryIndex := 0

	for i := len(activeMessages) - 1; i >= 0; i-- {
		msgTokens := EstimateTokens(activeMessages[i].Content)
		if keptTokens+msgTokens > targetKeepTokens {
			boundaryIndex = i + 1
			break
		}
		keptTokens += msgTokens
	}

	if boundaryIndex < 1 {
		boundaryIndex = 1
	}
	if boundaryIndex >= len(activeMessages) {
		boundaryIndex = len(activeMessages) - 1
	}

	for i := boundaryIndex; i < len(activeMessages)-1; i++ {
		msg := activeMessages[i]
		if msg.Role == "user" || msg.Role == "system" {
			boundaryIndex = i
			break
		}
	}

	return CompactionDecision{
		ShouldCompact:    true,
		EstimatedTokens:  totalTokens,
		CompactUpToIndex: originalIndices[boundaryIndex-1],
		KeepFromIndex:    originalIndices[boundaryIndex],
	}
}
