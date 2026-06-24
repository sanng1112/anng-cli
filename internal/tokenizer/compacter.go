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

// EstimateTokens calculates tokens with adjustments for CJK characters (weight 1.5) and English characters (weight 0.45)
func EstimateTokens(content string) int {
	var total float64
	for _, r := range content {
		if unicode.Is(unicode.Han, r) || unicode.In(r, unicode.Hiragana, unicode.Katakana, unicode.Hangul) {
			total += 1.5
		} else {
			total += 0.45
		}
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
