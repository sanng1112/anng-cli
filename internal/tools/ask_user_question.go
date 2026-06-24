package tools

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

// AskUserQuestionTool formats a list of questions for the user to answer.
// Returns formatted text showing each question with options.
func AskUserQuestionTool(ctx context.Context, args map[string]interface{}) (string, error) {
	rawQuestions, ok := args["questions"].([]interface{})
	if !ok || len(rawQuestions) == 0 {
		return "", errors.New("missing or empty required argument 'questions'")
	}

	var builder strings.Builder
	builder.WriteString("Waiting for user input.\n")

	for i, rawQ := range rawQuestions {
		qMap, ok := rawQ.(map[string]interface{})
		if !ok {
			continue
		}
		qText, _ := qMap["question"].(string)
		multiSelect, _ := qMap["multiSelect"].(bool)

		mode := "single-select"
		if multiSelect {
			mode = "multi-select"
		}

		builder.WriteString(fmt.Sprintf("\n%d. %s\n   Mode: %s\n", i+1, qText, mode))

		if opts, ok := qMap["options"].([]interface{}); ok {
			for _, optVal := range opts {
				if optMap, ok := optVal.(map[string]interface{}); ok {
					label, _ := optMap["label"].(string)
					desc, _ := optMap["description"].(string)
					if desc != "" {
						builder.WriteString(fmt.Sprintf("   - %s (%s)\n", label, desc))
					} else {
						builder.WriteString(fmt.Sprintf("   - %s\n", label))
					}
				}
			}
		}
		builder.WriteString("   - Other\n")
	}

	return builder.String(), nil
}
