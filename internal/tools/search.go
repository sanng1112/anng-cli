package tools

import (
	"context"
	"io"
	"net/http"
	"regexp"
	"strings"
)

func ReadURLContent(ctx context.Context, url string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return "", err
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	html := string(bodyBytes)
	
	// Fast regex translator for converting fundamental HTML tags into clean Markdown elements
	reTitle := regexp.MustCompile(`(?i)<h1>(.*?)</h1>`)
	html = reTitle.ReplaceAllString(html, "# $1\n")

	rePara := regexp.MustCompile(`(?i)<p>(.*?)</p>`)
	html = rePara.ReplaceAllString(html, "$1\n")

	// Strip remaining structural tags
	reClean := regexp.MustCompile(`<.*?>`)
	markdown := reClean.ReplaceAllString(html, "")

	return strings.TrimSpace(markdown), nil
}
