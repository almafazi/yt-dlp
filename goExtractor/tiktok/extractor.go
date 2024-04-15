package tiktok

import (
	"bytes"
	"fmt"
	"html/template"
	"sort"
	"strings"

	"github.com/tdewolff/minify/v2"
	"github.com/tdewolff/minify/v2/html"
)

func getVideoLink(videoData map[string]interface{}, videoType string) map[string]interface{} {
	formats := videoData["formats"].([]interface{})
	filteredFormats := make([]interface{}, 0)

	for _, item := range formats {
		format := item.(map[string]interface{})
		if videoType == "watermarked" && strings.Contains(format["format_note"].(string), "watermarked") {
			filteredFormats = append(filteredFormats, item)
		} else if videoType == "nowatermarked" && !strings.Contains(format["format_note"].(string), "watermarked") {
			filteredFormats = append(filteredFormats, item)
		}
	}
	sort.Slice(filteredFormats, func(i, j int) bool {
		format1 := filteredFormats[i].(map[string]interface{})
		format2 := filteredFormats[j].(map[string]interface{})
		filesize1 := format1["filesize"].(float64)
		filesize2 := format2["filesize"].(float64)
		return filesize1 > filesize2
	})

	if len(filteredFormats) == 0 {
		return formats[0].(map[string]interface{})
	}
	return filteredFormats[0].(map[string]interface{})
}

func div(a, b float64) float64 {
	return a / b
}

func formatDuration(d float64) string {
	seconds := int(d)
	minutes := seconds / 60
	seconds = seconds % 60
	return fmt.Sprintf("%02d:%02d", minutes, seconds)
}

func Extract(videoData map[string]interface{}) (string, error) {
	tmpl, err := template.New("sf.html").Funcs(template.FuncMap{
		"formatDuration": formatDuration,
		"videoLink":      getVideoLink,
		"div":            div,
	}).ParseFiles(
		"views/go/sf.html",
		"views/go/extractor/youtube.html",
		"views/go/extractor/tiktok.html",
		"views/go/extractor/facebook.html")

	if err != nil {
		return "", err
	}

	var htmlContent bytes.Buffer
	err = tmpl.Execute(&htmlContent, videoData)
	if err != nil {
		return "", err
	}

	m := minify.New()
	m.AddFunc("text/html", html.Minify)

	minifiedHTML, err := m.String("text/html", htmlContent.String())
	if err != nil {
		return "", err
	}

	return minifiedHTML, nil
}
