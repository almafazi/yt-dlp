package youtube

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

	"github.com/joho/godotenv"
	"github.com/tdewolff/minify/v2"
	"github.com/tdewolff/minify/v2/html"
	"golang.org/x/crypto/scrypt"
)

func urlencode(str string) string {
	return url.QueryEscape(str)
}
func encrypt(format_id string, id string) (string, error) {
	text := fmt.Sprintf(`{"id":"%s","vid":"%s"}`, format_id, id)

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

// pad applies PKCS#7 padding to the plaintext.
func pad(plaintext []byte, blockSize int) []byte {
	padding := blockSize - len(plaintext)%blockSize
	padtext := bytes.Repeat([]byte{byte(padding)}, padding)
	return append(plaintext, padtext...)
}
func getVideoLink(videoData map[string]interface{}) []map[string]interface{} {
	formats := videoData["formats"].([]interface{})

	formatsSlice := make([]map[string]interface{}, len(formats))
	for i, format := range formats {
		formatsSlice[i] = format.(map[string]interface{})
	}

	// Sort formats by filesize
	sort.Slice(formatsSlice, func(i, j int) bool {
		filesizeI, okI := formatsSlice[i]["filesize"].(float64)
		if !okI { // If 'filesize' does not exist, try 'filesize_approx'
			filesizeI, okI = formatsSlice[i]["filesize_approx"].(float64)
			if !okI {
				filesizeI = -1 // Use -1 if neither exists, to ensure it sorts correctly
			}
		}

		filesizeJ, okJ := formatsSlice[j]["filesize"].(float64)
		if !okJ { // If 'filesize' does not exist, try 'filesize_approx'
			filesizeJ, okJ = formatsSlice[j]["filesize_approx"].(float64)
			if !okJ {
				filesizeJ = -1 // Use -1 if neither exists, to ensure it sorts correctly
			}
		}

		// Descending order
		return filesizeI > filesizeJ
	})

	// Filter formats by extension and protocol
	allowedExtensions := map[string]bool{"mp3": true, "mp4": true, "webm": true, "3gp": true, "ogg": true, "m4a": true}
	filteredFormats := make([]map[string]interface{}, 0)
	uniqueFormats := make(map[string]bool)
	for _, format := range formatsSlice {
		if ext, ok := format["ext"].(string); ok && allowedExtensions[ext] {
			if protocol, ok := format["protocol"].(string); ok && protocol == "https" {
				// Include 'acodec' in the uniqueness check
				acodec, okAcodec := format["acodec"].(string)
				if !okAcodec {
					acodec = "none" // Use a placeholder if 'acodec' is not present
				}
				heightExtAcodec := fmt.Sprintf("%v.%s.%s", format["height"], ext, acodec) // Now includes 'acodec'
				if _, exists := uniqueFormats[heightExtAcodec]; !exists {
					uniqueFormats[heightExtAcodec] = true
					filteredFormats = append(filteredFormats, format)
				}
			}
		}
	}

	filteredFormatsJSON, err := json.MarshalIndent(filteredFormats, "", "    ")
	if err != nil {
		fmt.Println("Error marshalling filteredFormats to JSON:", err)
	} else {
		fmt.Println("filteredFormats as JSON:", string(filteredFormatsJSON))
	}

	return filteredFormats

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

	videoData["videoLinks"] = getVideoLink(videoData)
	downloadBaseUrl := os.Getenv("DOWNLOAD_BASE_URL_YT")
	videoData["downloadBaseUrl"] = downloadBaseUrl
	videoData["webpage_url"] = videoData["webpage_url"].(string)
	videoData["id"] = videoData["id"].(string)
	videoData["fulltitle"] = videoData["title"].(string)

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
