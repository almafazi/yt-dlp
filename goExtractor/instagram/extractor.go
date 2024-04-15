package instagram

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
	"os/exec"

	"github.com/joho/godotenv"
	"github.com/tdewolff/minify/v2"
	"github.com/tdewolff/minify/v2/html"
	"golang.org/x/crypto/scrypt"
)

var cookies = "gallery-dl/cookies/cookies.txt"

func div(a, b float64) float64 {
	return a / b
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

// pad applies PKCS#7 padding to the plaintext.
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

func Extract(url string) ([]byte, error) {

	err := godotenv.Load()
	if err != nil {
		return nil, err
	}

	cmd := exec.Command("./gallery-dl/gallery-dl", "--no-download", "--dump-json", "--cookies", cookies, url)
	out, err := cmd.Output()
	if err != nil {
		return nil, err
	}

	var videoData [][]interface{}
	err = json.Unmarshal(out, &videoData)
	if err != nil {
		return nil, err
	}

	videoDataFresh := videoData[1:]

	formattedData := make([]map[string]interface{}, len(videoDataFresh))

	for i, item := range videoDataFresh {
		formattedData[i] = map[string]interface{}{
			"video_url":   item[2].(map[string]interface{})["video_url"],
			"display_url": item[2].(map[string]interface{})["display_url"],
			"description": item[2].(map[string]interface{})["description"],
			"date":        item[2].(map[string]interface{})["date"],
			"username":    item[2].(map[string]interface{})["username"],
		}
	}

	var parsedData = make(map[string]interface{})

	parsedData["videoLinks"] = formattedData
	imageBaseUrl := os.Getenv("IMAGE_BASE_URL")
	downloadBaseUrl := os.Getenv("DOWNLOAD_BASE_URL")
	parsedData["imageBaseUrl"] = imageBaseUrl
	parsedData["downloadBaseUrl"] = downloadBaseUrl

	tmpl, err := template.New("instagram.html").Funcs(template.FuncMap{
		"formatDuration": formatDuration,
		"encrypt":        encrypt,
		"urlencode":      urlencode,
		"div":            div,
	}).ParseFiles("views/go/extractor/instagram.html")

	if err != nil {
		return nil, err
	}

	var htmlContent bytes.Buffer
	err = tmpl.Execute(&htmlContent, parsedData)
	if err != nil {
		return nil, err
	}

	m := minify.New()
	m.AddFunc("text/html", html.Minify)

	minifiedHTML, err := m.String("text/html", htmlContent.String())
	if err != nil {
		return nil, err
	}

	jsonResponse, err := json.Marshal(map[string]string{"html": minifiedHTML})
	if err != nil {
		return nil, err
	}

	return jsonResponse, nil
}
