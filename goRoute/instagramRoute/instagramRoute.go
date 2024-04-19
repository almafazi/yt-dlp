package instagramRoute

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/tls"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"

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
	query := r.URL.Query()
	imgurl := query.Get("imgurl")
	vidurl := query.Get("vidurl")
	fullname := query.Get("fullname")

	if (imgurl == "" && vidurl == "") || fullname == "" {
		http.Error(w, `{"error": "Invalid request. Please provide either imgurl or vidurl."}`, http.StatusBadRequest)
		return
	}

	var fileURL, fileName, contentType string
	if imgurl != "" {
		decryptedURL, err := decrypt(imgurl)
		if err != nil {
			log.Printf("Error decrypting imgurl: %v", err)
			http.Error(w, "", http.StatusInternalServerError)
			return
		}
		fileURL = decryptedURL
		fileName = url.QueryEscape(fullname) + ".jpg"
		contentType = "image/jpeg"
	} else if vidurl != "" {
		decryptedURL, err := decrypt(vidurl)
		if err != nil {
			log.Printf("Error decrypting vidurl: %v", err)
			http.Error(w, "", http.StatusInternalServerError)
			return
		}
		fileURL = decryptedURL
		fileName = url.QueryEscape(fullname) + ".mp4"
		contentType = "video/mp4"
	}

	resp, err := http.Get(fileURL)
	if err != nil {
		log.Printf("Error fetching file: %v", err)
		http.Error(w, "", http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Printf("Non-OK HTTP status: %d", resp.StatusCode)
		http.Error(w, "", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", fileName))
	w.Header().Set("Content-Type", contentType)
	_, err = io.Copy(w, resp.Body)
	if err != nil {
		http.Error(w, "Error streaming response", http.StatusInternalServerError)
	}
}

func InstagramHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
	w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")

	url := r.URL.Query().Get("url")
	decryptedURL, err := decrypt(url)
	if err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	client := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
	}

	resp, err := client.Get(decryptedURL)
	if err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Cross-Origin-Resource-Policy", "cross-origin")
	w.Header().Set("Content-Type", "image/jpeg")
	_, err = io.Copy(w, resp.Body)
	if err != nil {
		http.Error(w, "Error streaming response", http.StatusInternalServerError)
	}
}

func RegisterInstagramRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/instagram/streamdurl", InstagramHandler)
	mux.HandleFunc("/instagram/downloadurl", downloadHandler)
}
