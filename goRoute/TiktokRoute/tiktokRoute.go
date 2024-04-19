package tiktokRoute

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"time"

	"golang.org/x/crypto/scrypt"
)

func removeSymbolsAndStrangeLetters(str string) string {
	// Remove symbols
	symbolsRemoved := regexp.MustCompile(`[^\w\s]`).ReplaceAllString(str, "")

	// Remove strange letters
	strangeLettersRemoved := regexp.MustCompile(`[^\x00-\x7F]`).ReplaceAllString(symbolsRemoved, "")

	return strangeLettersRemoved
}

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

// unpad removes PKCS#7 padding from the plaintext.
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
	videotype := r.URL.Query().Get("type")
	encryptedUrl := r.URL.Query().Get("link")
	if encryptedUrl == "" {
		encryptedUrl = r.URL.Query().Get("musiclink")
	}
	if encryptedUrl == "" {
		encryptedUrl = r.URL.Query().Get("imglink")
	}
	name := r.URL.Query().Get("author")

	if videotype == "normal" {
		var ext string
		if _, ok := r.URL.Query()["musiclink"]; ok {
			ext = ".mp3"
		} else if _, ok := r.URL.Query()["imglink"]; ok {
			ext = ".jpg"
		} else if _, ok := r.URL.Query()["link"]; ok {
			ext = ".mp4"
		} else {
			http.Error(w, "error", http.StatusBadRequest)
			return
		}

		if encryptedUrl == "" || name == "" {
			http.Error(w, "Missing url or name parameter", http.StatusBadRequest)
			return
		}

		// Generate the filename
		randomBytes := make([]byte, 6)
		_, err := rand.Read(randomBytes)
		if err != nil {
			http.Error(w, "Failed to generate random bytes", http.StatusInternalServerError)
			return
		}
		filename := fmt.Sprintf("%s %s-%s%s",
			removeSymbolsAndStrangeLetters(name),
			time.Now().Format("2006-01-02 15-04-05"),
			hex.EncodeToString(randomBytes),
			ext,
		)

		decryptedUrl, err := decrypt(encryptedUrl)
		if err != nil {
			http.Error(w, "Failed to decrypt link", http.StatusInternalServerError)
			return
		}

		// Make a request to the decrypted URL
		resp, err := http.Get(decryptedUrl)
		if err != nil {
			http.Error(w, "An error occurred while processing your request.", http.StatusInternalServerError)
			return
		}
		defer resp.Body.Close()

		// Set headers based on the response
		w.Header().Set("Content-Length", resp.Header.Get("Content-Length"))
		w.Header().Set("Content-Transfer-Encoding", "Binary")
		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))

		// Write the body to the client response
		io.Copy(w, resp.Body)
	}
}

func RegisterTiktokRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/tiktok/downloadurl", downloadHandler)
}
