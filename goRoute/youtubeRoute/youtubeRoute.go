package youtubeRoute

import (
	"crypto/aes"
	"crypto/cipher"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os/exec"

	"golang.org/x/crypto/scrypt"
)

func decrypt(encryptedText string) (string, error) {
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

	ciphertext, err := hex.DecodeString(encryptedText)
	if err != nil {
		return "", err
	}

	if len(ciphertext) < aes.BlockSize {
		return "", fmt.Errorf("ciphertext too short")
	}

	iv := make([]byte, aes.BlockSize) // The IV is known to be all zeros for this encryption scheme
	mode := cipher.NewCBCDecrypter(block, iv)

	mode.CryptBlocks(ciphertext, ciphertext)

	plaintext, err := unpad(ciphertext)
	if err != nil {
		return "", err
	}

	return string(plaintext), nil
}

func unpad(plaintext []byte) ([]byte, error) {
	length := len(plaintext)
	padLen := int(plaintext[length-1])
	if padLen > aes.BlockSize || padLen > length {
		return nil, fmt.Errorf("invalid padding")
	}
	for _, val := range plaintext[length-padLen:] {
		if int(val) != padLen {
			return nil, fmt.Errorf("invalid padding")
		}
	}
	return plaintext[:length-padLen], nil
}

func downloadHandler(w http.ResponseWriter, r *http.Request) {
	link := r.URL.Query().Get("link")

	decryptedLink, err := decrypt(link)
	if err != nil {
		http.Error(w, "Failed to decrypt link", http.StatusInternalServerError)
		return
	}

	var parsedData struct {
		ID  string `json:"id"`
		Vid string `json:"vid"`
	}
	err = json.Unmarshal([]byte(decryptedLink), &parsedData)
	if err != nil || parsedData.ID == "" || parsedData.Vid == "" {
		http.Error(w, "Invalid data", http.StatusBadRequest)
		return
	}

	proxyUrl := "http://mdjxjxut-rotate:7ffa95jej8l5@p.webshare.io:80"
	command := fmt.Sprintf("./yt-dlp.sh -f %s --no-warning --dump-json --proxy %s %s", parsedData.ID, proxyUrl, parsedData.Vid)

	cmd := exec.Command("bash", "-c", command)
	output, err := cmd.CombinedOutput()
	if err != nil {
		http.Error(w, "Failed to execute command", http.StatusInternalServerError)
		return
	}

	var videoInfo struct {
		URL    string `json:"url"`
		Title  string `json:"title"`
		Format string `json:"ext"`
	}
	err = json.Unmarshal(output, &videoInfo)
	if err != nil {
		http.Error(w, "Failed to parse video info", http.StatusInternalServerError)
		return
	}

	// Set headers to force download
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s.%s", videoInfo.Title, videoInfo.Format))
	w.Header().Set("Content-Type", fmt.Sprintf("video/%s", videoInfo.Format))

	// Fetch and stream the video
	resp, err := http.Get(videoInfo.URL)
	if err != nil {
		http.Error(w, "Failed to fetch video", http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()
	if _, err := io.Copy(w, resp.Body); err != nil {
		http.Error(w, "Failed to stream video", http.StatusInternalServerError)
	}
}

func RegisterYoutubeRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/youtube/downloadurl", downloadHandler)
}
