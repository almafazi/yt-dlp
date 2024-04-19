package facebook

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html/template"
	"sort"

	"github.com/tdewolff/minify/v2"
	"github.com/tdewolff/minify/v2/html"
)

func div(a, b float64) float64 {
	return a / b
}

func formatDuration(d float64) string {
	seconds := int(d)
	minutes := seconds / 60
	seconds = seconds % 60
	return fmt.Sprintf("%02d:%02d", minutes, seconds)
}

func getVideoLink(videoData map[string]interface{}) []interface{} {
	formats := videoData["formats"].([]interface{})
	//sort formats by format_id ascending
	sort.Slice(formats, func(i, j int) bool {
		format1 := formats[i].(map[string]interface{})
		format2 := formats[j].(map[string]interface{})
		return format1["format_id"].(string) < format2["format_id"].(string)
	})
	return formats
}

func Extract(videoData map[string]interface{}) (string, error) {
	tmpl, err := template.New("facebook.html").Funcs(template.FuncMap{
		"formatDuration": formatDuration,
		"videoLink":      getVideoLink,
		"div":            div,
	}).ParseFiles(
		"views/go/extractor/facebook.html")

	if err != nil {
		return "", err
	}

	videoData["videoLinks"] = getVideoLink(videoData)

	var htmlContent bytes.Buffer

	videoDataJSON, _ := json.MarshalIndent(videoData, "", "  ")
	fmt.Println(string(videoDataJSON))
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
