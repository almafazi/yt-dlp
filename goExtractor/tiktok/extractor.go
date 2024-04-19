package tiktok

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"html/template"
	"net/url"
	"os"
	"sort"
	"strings"

	"github.com/joho/godotenv"
	"github.com/tdewolff/minify/v2"
	"github.com/tdewolff/minify/v2/html"
	"golang.org/x/crypto/scrypt"
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
func pad(plaintext []byte, blockSize int) []byte {
	padding := blockSize - len(plaintext)%blockSize
	padtext := bytes.Repeat([]byte{byte(padding)}, padding)
	return append(plaintext, padtext...)
}

func formatDuration(d float64) string {
	seconds := int(d)
	minutes := seconds / 60
	seconds = seconds % 60
	return fmt.Sprintf("%02d:%02d", minutes, seconds)
}
func urlencode(str string) string {
	return url.QueryEscape(str)
}
func encrypt(text string) (string, error) {
	password := "encryption key"
	salt := []byte("salt")
	key, err := scrypt.Key([]byte(password), salt, 1<<15, 8, 1, 32)
	if err != nil {
		return "", err
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}

	plaintext := pad([]byte(text), block.BlockSize())
	iv := make([]byte, aes.BlockSize) // Using a zero IV for simplicity, replace with a random IV in production.
	ciphertext := make([]byte, len(plaintext))
	mode := cipher.NewCBCEncrypter(block, iv)
	mode.CryptBlocks(ciphertext, plaintext)

	return hex.EncodeToString(ciphertext), nil
}

func Extract(videoData map[string]interface{}) (string, error) {
	err := godotenv.Load()
	if err != nil {
		return "", err
	}
	tmpl, err := template.New("sf.html").Funcs(template.FuncMap{
		"formatDuration": formatDuration,
		"videoLink":      getVideoLink,
		"div":            div,
		"encrypt":        encrypt,
		"urlencode":      urlencode,
	}).ParseFiles(
		"views/go/sf.html",
		"views/go/extractor/youtube.html",
		"views/go/extractor/tiktok.html",
		"views/go/extractor/facebook.html")

	if err != nil {
		return "", err
	}

	var htmlContent bytes.Buffer

	downloadBaseUrl := os.Getenv("DOWNLOAD_BASE_URL_TIKTOK")
	videoData["downloadBaseUrl"] = downloadBaseUrl

	jsonData, err := json.MarshalIndent(videoData, "", "  ")
	if err != nil {
		fmt.Println("Error occurred during marshaling. Error: ")
	}
	fmt.Println(string(jsonData))

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
