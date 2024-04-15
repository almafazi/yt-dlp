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

	"github.com/buaazp/fasthttprouter"
	"github.com/valyala/fasthttp"
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

func downloadHandler(ctx *fasthttp.RequestCtx) {
	imgurl := string(ctx.QueryArgs().Peek("imgurl"))
	vidurl := string(ctx.QueryArgs().Peek("vidurl"))
	fullname := string(ctx.QueryArgs().Peek("fullname"))

	if (imgurl == "" && vidurl == "") || fullname == "" {
		ctx.SetStatusCode(fasthttp.StatusBadRequest)
		ctx.SetBodyString(`{"error": "Invalid request. Please provide either imgurl or vidurl."}`)
		return
	}

	var fileURL, fileName, contentType string
	if imgurl != "" {
		decryptedURL, err := decrypt(imgurl)
		if err != nil {
			log.Printf("Error decrypting imgurl: %v", err)
			ctx.SetStatusCode(fasthttp.StatusInternalServerError)
			return
		}
		fileURL = decryptedURL
		fileName = url.QueryEscape(fullname) + ".jpg"
		contentType = "image/jpeg"
	} else if vidurl != "" {
		decryptedURL, err := decrypt(vidurl)
		if err != nil {
			log.Printf("Error decrypting vidurl: %v", err)
			ctx.SetStatusCode(fasthttp.StatusInternalServerError)
			return
		}
		fileURL = decryptedURL
		fileName = url.QueryEscape(fullname) + ".mp4"
		contentType = "video/mp4"
	}

	// Make the request to the actual file URL
	statusCode, body, err := fasthttp.Get(nil, fileURL)
	if err != nil {
		log.Printf("Error fetching file: %v", err)
		ctx.SetStatusCode(fasthttp.StatusInternalServerError)
		return
	}
	if statusCode != fasthttp.StatusOK {
		log.Printf("Non-OK HTTP status: %d", statusCode)
		ctx.SetStatusCode(fasthttp.StatusInternalServerError)
		return
	}

	ctx.Response.Header.Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", fileName))
	ctx.Response.Header.Set("Content-Type", contentType)
	ctx.SetBody(body)
}

// InstagramHandler handles requests for the Instagram route
func InstagramHandler(ctx *fasthttp.RequestCtx) {
	ctx.Response.Header.Set("Access-Control-Allow-Origin", "*")
	ctx.Response.Header.Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
	ctx.Response.Header.Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")

	// Assuming decrypt is a function you've defined to decrypt your URL
	url := string(ctx.QueryArgs().Peek("url"))
	decryptedText := url

	decryptedURL, err := decrypt(decryptedText) // Make sure to implement the decrypt function
	if err != nil {
		ctx.Error("Internal Server Error", fasthttp.StatusInternalServerError)
		return
	}
	// Create a HTTP client with default settings
	// You might want to customize the transport to disable TLS verification if needed
	client := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true}, // Be cautious with this in production
		},
	}

	// Make the GET request
	resp, err := client.Get(decryptedURL)
	if err != nil {
		ctx.Error("Internal Server Error", fasthttp.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	// Set headers and status code from the response
	ctx.SetStatusCode(resp.StatusCode)
	for key, values := range resp.Header {
		for _, value := range values {
			ctx.Response.Header.Set(key, value)
		}
	}

	ctx.Response.Header.Set("Cross-Origin-Resource-Policy", "cross-origin")
	ctx.Response.Header.Set("Content-Type", "image/jpeg") // If you're serving an image file from your Go server using the `InstagramHandler` function but it can't be displayed on the client, there are several potential reasons why this might be happening. Here are some common issues to check based on the provided code:
	// Stream the response body to the client
	_, err = io.Copy(ctx.Response.BodyWriter(), resp.Body)
	if err != nil {
		ctx.Error("Error streaming response", fasthttp.StatusInternalServerError)
	}
}

// RegisterInstagramRoutes registers the Instagram routes to the router
func RegisterInstagramRoutes(router *fasthttprouter.Router) {
	router.GET("/instagram/streamdurl", InstagramHandler)
	router.GET("/instagram/downloadurl", downloadHandler)

}
