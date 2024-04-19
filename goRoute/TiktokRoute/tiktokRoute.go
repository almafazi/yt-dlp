package tiktokRoute

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"regexp"
	"time"

	"github.com/buaazp/fasthttprouter"
	"github.com/valyala/fasthttp"
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

func downloadHandler(ctx *fasthttp.RequestCtx) {
	videotype := string(ctx.QueryArgs().Peek("type"))
	encryptedUrl := string(ctx.QueryArgs().Peek("link"))
	if encryptedUrl == "" {
		encryptedUrl = string(ctx.QueryArgs().Peek("musiclink"))
	}
	if encryptedUrl == "" {
		encryptedUrl = string(ctx.QueryArgs().Peek("imglink"))
	}
	name := string(ctx.QueryArgs().Peek("author"))

	if videotype == "normal" {
		var ext string
		if ctx.QueryArgs().Has("musiclink") {
			ext = ".mp3"
		} else if ctx.QueryArgs().Has("imglink") {
			ext = ".jpg"
		} else if ctx.QueryArgs().Has("link") {
			ext = ".mp4"
		} else {
			ctx.SetStatusCode(fasthttp.StatusBadRequest)
			ctx.SetBodyString("error")
			return
		}

		if encryptedUrl == "" || name == "" {
			ctx.SetStatusCode(fasthttp.StatusBadRequest)
			ctx.SetBodyString("Missing url or name parameter")
			return
		}

		// Generate the filename
		randomBytes := make([]byte, 6)
		_, err := rand.Read(randomBytes)
		if err != nil {
			ctx.SetStatusCode(fasthttp.StatusInternalServerError)
			ctx.SetBodyString("Failed to generate random bytes")
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
			ctx.SetStatusCode(fasthttp.StatusInternalServerError)
			ctx.SetBodyString("Failed to decrypt link")
			return
		}

		decryptedUrl = "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"

		// Make a request to the decrypted URL
		req := fasthttp.AcquireRequest()
		defer fasthttp.ReleaseRequest(req) // Ensure resources are released
		req.SetRequestURI(decryptedUrl)

		resp := fasthttp.AcquireResponse()
		defer fasthttp.ReleaseResponse(resp) // Ensure resources are released

		// Perform the request
		err = fasthttp.Do(req, resp)
		if err != nil {
			ctx.SetStatusCode(fasthttp.StatusInternalServerError)
			ctx.SetBodyString("An error occurred while processing your request.")
			return
		}

		// Set headers based on the response
		ctx.Response.Header.Set("Content-Length", fmt.Sprintf("%d", len(resp.Body())))
		ctx.Response.Header.Set("Content-Transfer-Encoding", "Binary")
		ctx.Response.Header.Set("Content-Type", "application/octet-stream")
		ctx.Response.Header.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))

		// Write the body to the client response
		ctx.Write(resp.Body())

	}

}

func RegisterTiktokRoutes(router *fasthttprouter.Router) {
	router.GET("/tiktok/downloadurl", downloadHandler)
}
