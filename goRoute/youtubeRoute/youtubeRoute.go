package youtubeRoute

import (
	"crypto/aes"
	"crypto/cipher"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os/exec"

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
	link := string(ctx.QueryArgs().Peek("link"))

	decryptedLink, err := decrypt(link)
	if err != nil {
		ctx.SetStatusCode(fasthttp.StatusInternalServerError)
		ctx.SetBodyString("Failed to decrypt link")
		return
	}

	var parsedData struct {
		ID  string `json:"id"`
		Vid string `json:"vid"`
	}
	err = json.Unmarshal([]byte(decryptedLink), &parsedData)
	if err != nil || parsedData.ID == "" || parsedData.Vid == "" {
		ctx.SetStatusCode(fasthttp.StatusBadRequest)
		ctx.SetBodyString("Invalid data")
		return
	}

	proxyUrl := "http://mdjxjxut-rotate:7ffa95jej8l5@p.webshare.io:80"
	command := fmt.Sprintf("./yt-dlp.sh -f %s --no-warning --dump-json --proxy %s %s", parsedData.ID, proxyUrl, parsedData.Vid)

	cmd := exec.Command("bash", "-c", command)
	output, err := cmd.CombinedOutput()
	if err != nil {
		ctx.SetStatusCode(fasthttp.StatusInternalServerError)
		ctx.SetBodyString("Failed to execute command")
		return
	}

	var videoInfo struct {
		URL    string `json:"url"`
		Title  string `json:"title"`
		Format string `json:"ext"`
	}
	err = json.Unmarshal(output, &videoInfo)
	if err != nil {
		ctx.SetStatusCode(fasthttp.StatusInternalServerError)
		ctx.SetBodyString("Failed to parse video info")
		return
	}

	// Set headers to force download
	ctx.Response.Header.Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s.%s", videoInfo.Title, videoInfo.Format))
	ctx.Response.Header.Set("Content-Type", fmt.Sprintf("video/%s", videoInfo.Format))

	// Fetch and stream the video
	resp := fasthttp.AcquireResponse()
	client := &fasthttp.Client{}
	req := fasthttp.AcquireRequest()
	req.SetRequestURI(videoInfo.URL)
	err = client.Do(req, resp)
	if err != nil {
		ctx.SetStatusCode(fasthttp.StatusInternalServerError)
		ctx.SetBodyString("Failed to fetch video")
		return
	}
	ctx.Write(resp.Body())
	fasthttp.ReleaseRequest(req)
	fasthttp.ReleaseResponse(resp)
}

func RegisterYoutubeRoutes(router *fasthttprouter.Router) {
	router.GET("/youtube/downloadurl", downloadHandler)

}
