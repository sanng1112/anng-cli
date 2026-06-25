package agent

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const DefaultSystemPrompt = `# ROLE & OBJECTIVE
You are ANNG, an elite, autonomous Software Engineering AI Agent operating within a highly optimized CLI environment. Your goal is to solve complex programming tasks, debug errors, and refactor code with maximum efficiency.

# SYSTEM CAPABILITIES & CONSTRAINTS
1. TERMINAL TRUNCATION: If you execute a bash command and the output exceeds 200 lines, the system will automatically hard-cut the middle. You will only see the FIRST 50 lines and the LAST 50 lines. Use them to debug.
2. CONTEXT PRUNING: Your memory is actively managed. Old logs are summarized to keep context under limits. Focus on the current state.
3. PARALLEL TOOL CALLING: You are explicitly authorized and highly encouraged to execute MULTIPLE tool calls simultaneously in a single turn to save time. DO NOT work sequentially if tasks are independent.

# EXECUTION WORKFLOW
1. Analyze the user's request.
2. Determine the maximum number of independent tools you can fire simultaneously to gather information.
3. Formulate the solution and apply changes. Always verify files after edits.`

const YoloSystemPrompt = `You are ANNG, a careful and helpful coding agent that works in the background.
You are tasked to solve an issue reported by the user. Your goal is to utilize the tools at your disposal to investigate and answer the question according to the user's instructions with the aim to verify that the issue is resolved autonomously.

# EXECUTION WORKFLOW & RULES
1. Always match output format exactly as shown in examples or existing files.
2. Use only libraries and frameworks that are confirmed and compatible to be in use in the current codebase.
3. Provide complete and functional code without omissions or placeholders.
4. You can call multiple tools in a single response. Do not split independent reads or checks across separate turns.
5. Do not consider the task complete until the tests pass.`

const PlanModeInstructions = `# PLANNING MODE
You are in planning mode. You cannot run mutating commands (bash, write, edit). They will be blocked. Focus on analysis, design unit decomposition, and alignment.`

type PromptEngine struct{}

type PromptParts struct {
	StaticPrefix   string
	RuntimeOverlay string
}

func NewPromptEngine() *PromptEngine {
	return &PromptEngine{}
}

func (pe *PromptEngine) BuildPromptParts(model string, projectRoot string, mode string) PromptParts {
	staticPrefix := buildStaticPromptPrefix(mode)
	runtimeOverlay := buildRuntimePromptOverlay(model, projectRoot)
	return PromptParts{
		StaticPrefix:   staticPrefix,
		RuntimeOverlay: runtimeOverlay,
	}
}

func (pe *PromptEngine) BuildSystemPrompt(model string, projectRoot string, mode string) string {
	parts := pe.BuildPromptParts(model, projectRoot, mode)
	if parts.RuntimeOverlay == "" {
		return parts.StaticPrefix
	}
	return parts.StaticPrefix + "\n\n" + parts.RuntimeOverlay
}

func buildStaticPromptPrefix(mode string) string {
	var sb strings.Builder

	// 1. Select template based on mode
	if mode == "yolo" {
		sb.WriteString(YoloSystemPrompt)
	} else {
		sb.WriteString(DefaultSystemPrompt)
	}

	// 2. Append mode instructions if planning
	if mode == "plan" {
		sb.WriteString("\n\n" + PlanModeInstructions)
	}

	return sb.String()
}

func buildRuntimePromptOverlay(model string, projectRoot string) string {
	var sb strings.Builder

	// 3. Runtime Context
	sb.WriteString("\n\n# Local Workspace Environment\n\n<env>\n")
	sb.WriteString(fmt.Sprintf("1. Platform: %s %s\n", runtime.GOOS, runtime.GOARCH))
	// Use a date-based version identifier for prompt caching stability.
	// Full date changes every day, but within a day the prefix remains cacheable.
	sb.WriteString(fmt.Sprintf("2. Date: %s\n", time.Now().Format("2006-01-02")))
	sb.WriteString(fmt.Sprintf("3. Working Directory: %s\n", projectRoot))
	sb.WriteString(fmt.Sprintf("4. Model: %s\n", model))
	sb.WriteString(fmt.Sprintf("5. Model Family: %s\n", ModelFamilyLabel(model)))

	// Detect tools
	rgPath, _ := exec.LookPath("rg")
	sb.WriteString(fmt.Sprintf("6. Ripgrep Installed: %v\n", rgPath != ""))
	jqPath, _ := exec.LookPath("jq")
	sb.WriteString(fmt.Sprintf("7. JQ Installed: %v\n", jqPath != ""))
	sb.WriteString("</env>")

	// 4. Load Workspace Rules
	anngMdPath := filepath.Join(projectRoot, "ANNG.md")
	if data, err := os.ReadFile(anngMdPath); err == nil && len(data) > 0 {
		sb.WriteString("\n\n# ANNG Workspace Cache / Rules\n\n" + string(data))
	}

	return sb.String()
}
