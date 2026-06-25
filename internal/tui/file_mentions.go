package tui

import (
	"os"
	"path/filepath"
	"strings"
)

func GetFileMentions(cwd string, query string) []string {
	var matches []string
	cleanQuery := strings.ReplaceAll(query, "@", "")
	
	// Fast background-friendly directory traversal up to depth 3
	filepath.WalkDir(cwd, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		
		rel, err := filepath.Rel(cwd, path)
		if err != nil || rel == "." || strings.HasPrefix(rel, ".") {
			if d.IsDir() && rel != "." && strings.HasPrefix(rel, ".") {
				return filepath.SkipDir
			}
			return nil
		}

		if strings.HasPrefix(strings.ToLower(rel), strings.ToLower(cleanQuery)) {
			if d.IsDir() {
				matches = append(matches, "@"+rel+"/")
			} else {
				matches = append(matches, "@"+rel)
			}
		}

		if len(matches) >= 10 {
			return filepath.SkipAll
		}
		return nil
	})

	return matches
}
