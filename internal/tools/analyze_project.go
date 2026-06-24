package tools

import (
	"bufio"
	"context"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"

	"anng-cli/internal/contextkeys"
)

// AnalyzeProjectTool generates a structural and semantic map of the project workspace.
// Runs `find` to list the directory tree and scans Go files for exported symbols.
func AnalyzeProjectTool(ctx context.Context, args map[string]interface{}) (string, error) {
	projectRoot := "."
	if pr, ok := ctx.Value(contextkeys.ProjectRootKey).(string); ok {
		projectRoot = pr
	}

	depth := 3
	if d, ok := args["depth"].(float64); ok {
		depth = int(d)
	}

	// Build directory tree using find
	var treeOutput string
	cmd := exec.CommandContext(ctx, "find", projectRoot,
		"-maxdepth", fmt.Sprintf("%d", depth),
		"-not", "-path", "*/node_modules/*",
		"-not", "-path", "*/.git/*",
		"-not", "-path", "*/dist/*",
	)
	out, err := cmd.CombinedOutput()
	if err == nil {
		treeOutput = string(out)
	} else {
		treeOutput = fmt.Sprintf("Failed to run find: %v", err)
	}

	// Read go.mod if present
	goModBytes, _ := os.ReadFile(filepath.Join(projectRoot, "go.mod"))
	goModContent := string(goModBytes)

	// Read package.json if present (for TS/JS projects)
	pkgJsonBytes, _ := os.ReadFile(filepath.Join(projectRoot, "package.json"))
	pkgJsonContent := string(pkgJsonBytes)
	if len(pkgJsonContent) > 3000 {
		pkgJsonContent = pkgJsonContent[:3000] + "\n...[truncated]"
	}

	// Scan Go files for exported symbols (types, interfaces, functions)
	var semanticMap strings.Builder
	semanticMap.WriteString("Semantic Export Map (Structs, Interfaces, Funcs):\n")

	typeReg := regexp.MustCompile(`^type\s+([A-Z][a-zA-Z0-9_]*)\s+(struct|interface)`)
	funcReg := regexp.MustCompile(`^func\s+(?:\([^)]+\)\s+)?([A-Z][a-zA-Z0-9_]*)\(`)

	filepath.WalkDir(projectRoot, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			name := d.Name()
			if name == "node_modules" || name == ".git" || name == "dist" || name == "build" {
				return filepath.SkipDir
			}
			return nil
		}
		if filepath.Ext(path) != ".go" {
			return nil
		}

		file, err := os.Open(path)
		if err != nil {
			return nil
		}
		defer file.Close()

		var symbols []string
		scanner := bufio.NewScanner(file)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if matches := typeReg.FindStringSubmatch(line); len(matches) > 1 {
				symbols = append(symbols, matches[1])
			} else if matches := funcReg.FindStringSubmatch(line); len(matches) > 1 {
				symbols = append(symbols, matches[1])
			}
		}

		if len(symbols) > 0 {
			rel, _ := filepath.Rel(projectRoot, path)
			semanticMap.WriteString(fmt.Sprintf("- %s: %s\n", rel, strings.Join(symbols, ", ")))
		}
		return nil
	})

	output := fmt.Sprintf(
		"Directory Tree:\n%s\n\ngo.mod:\n%s\n\npackage.json:\n%s\n\n%s",
		treeOutput, goModContent, pkgJsonContent, semanticMap.String(),
	)
	return output, nil
}
