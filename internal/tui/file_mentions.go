package tui

import (
	"os"
	"path/filepath"
)

func GetFileMentions(cwd string, query string) []string {
	var matches []string
	searchPath := filepath.Join(cwd, query+"*")
	
	files, err := filepath.Glob(searchPath)
	if err != nil || len(files) == 0 {
		return matches
	}

	for _, f := range files {
		rel, err := filepath.Rel(cwd, f)
		if err == nil {
			stat, err := os.Stat(f)
			if err == nil && stat.IsDir() {
				matches = append(matches, "@"+rel+"/")
			} else {
				matches = append(matches, "@"+rel)
			}
		}
	}
	
	if len(matches) > 10 {
		matches = matches[:10]
	}
	return matches
}
