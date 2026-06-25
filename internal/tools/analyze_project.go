package tools

import (
	"context"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"anng-cli/internal/contextkeys"
)

// AnalyzeProjectTool generates a structural and semantic map of the project workspace using AST parsing.
func AnalyzeProjectTool(ctx context.Context, args map[string]interface{}) (string, error) {
	projectRoot := "."
	if pr, ok := ctx.Value(contextkeys.ProjectRootKey).(string); ok {
		projectRoot = pr
	}

	depth := 3
	if d, ok := args["depth"].(float64); ok {
		depth = int(d)
	}

	// Build directory tree using Go filepath.Walk (cross-platform, no shell dependency)
	var treeOutput string
	{
		var sb strings.Builder
		skipDirs := map[string]bool{"node_modules": true, ".git": true, "dist": true, "build": true, ".cache": true}
		depthCount := 0
		filepath.WalkDir(projectRoot, func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return nil
			}
			rel, relErr := filepath.Rel(projectRoot, path)
			if relErr != nil {
				return nil
			}
			if rel == "." {
				sb.WriteString(".\n")
				return nil
			}
			if d.IsDir() && skipDirs[d.Name()] {
				return filepath.SkipDir
			}
			if d.IsDir() {
				depthCount = strings.Count(rel, string(filepath.Separator)) + 1
				if depthCount > depth {
					return filepath.SkipDir
				}
			}
			sb.WriteString("./" + rel + "\n")
			return nil
		})
		treeOutput = sb.String()
	}

	// Read go.mod if present
	goModBytes, _ := os.ReadFile(filepath.Join(projectRoot, "go.mod"))
	goModContent := string(goModBytes)

	// Read package.json if present for mixed-language workspaces.
	pkgJsonBytes, _ := os.ReadFile(filepath.Join(projectRoot, "package.json"))
	pkgJsonContent := string(pkgJsonBytes)
	if len(pkgJsonContent) > 3000 {
		pkgJsonContent = pkgJsonContent[:3000] + "\n...[truncated]"
	}

	// Scan Go files for exported symbols using Go AST parser
	var semanticMap strings.Builder
	semanticMap.WriteString("Semantic Export Map (Structs, Interfaces, Funcs):\n")

	fset := token.NewFileSet()
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
		if filepath.Ext(path) != ".go" || strings.HasSuffix(path, "_test.go") {
			return nil
		}

		fileAST, err := parser.ParseFile(fset, path, nil, parser.ParseComments)
		if err != nil {
			return nil
		}

		var symbols []string
		for _, decl := range fileAST.Decls {
			switch gd := decl.(type) {
			case *ast.GenDecl:
				if gd.Tok == token.TYPE {
					for _, spec := range gd.Specs {
						ts, ok := spec.(*ast.TypeSpec)
						if !ok {
							continue
						}
						switch ts.Type.(type) {
						case *ast.StructType:
							symbols = append(symbols, fmt.Sprintf("%s [Struct]", ts.Name.Name))
						case *ast.InterfaceType:
							symbols = append(symbols, fmt.Sprintf("%s [Interface]", ts.Name.Name))
						}
					}
				}
			case *ast.FuncDecl:
				symbolName := gd.Name.Name
				if gd.Recv != nil && len(gd.Recv.List) > 0 {
					var receiverName string
					switch rt := gd.Recv.List[0].Type.(type) {
					case *ast.Ident:
						receiverName = rt.Name
					case *ast.StarExpr:
						if ident, ok := rt.X.(*ast.Ident); ok {
							receiverName = ident.Name
						}
					}
					if receiverName != "" {
						symbolName = fmt.Sprintf("%s.Method: %s", receiverName, gd.Name.Name)
					}
				} else {
					symbolName = fmt.Sprintf("Func: %s", symbolName)
				}
				symbols = append(symbols, symbolName)
			}
		}

		if len(symbols) > 0 {
			rel, _ := filepath.Rel(projectRoot, path)
			semanticMap.WriteString(fmt.Sprintf("- %s: %s\n", rel, strings.Join(symbols, ", ")))
		}
		return nil
	})

	var manifests []string
	if strings.TrimSpace(goModContent) != "" {
		manifests = append(manifests, "go.mod:\n"+goModContent)
	}
	if strings.TrimSpace(pkgJsonContent) != "" {
		manifests = append(manifests, "package.json:\n"+pkgJsonContent)
	}
	if len(manifests) == 0 {
		manifests = append(manifests, "No root manifest files detected.")
	}

	output := fmt.Sprintf(
		"Directory Tree:\n%s\n\n%s\n\n%s",
		treeOutput, strings.Join(manifests, "\n\n"), semanticMap.String(),
	)
	return output, nil
}
