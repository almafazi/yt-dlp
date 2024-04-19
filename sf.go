package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os/exec"

	"github.com/buaazp/fasthttprouter"
	"github.com/valyala/fasthttp"

	"sf/goExtractor/facebook"
	"sf/goExtractor/instagram"
	"sf/goExtractor/tiktok"
	"sf/goExtractor/youtube"
	tiktokRoute "sf/goRoute/TiktokRoute"
	"sf/goRoute/instagramRoute"
	"sf/goRoute/youtubeRoute"
	"sf/goUtils/utils"
)

var scriptPath = "yt_dlp/__main__.py"

func handler(ctx *fasthttp.RequestCtx) {
	ctx.Response.Header.Set("Access-Control-Allow-Origin", "*")
	ctx.Response.Header.Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
	ctx.Response.Header.Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")

	url := string(ctx.QueryArgs().Peek("url"))
	if url == "" {
		ctx.Error("URL is required", fasthttp.StatusBadRequest)
		return
	}

	if utils.IsInstagramURL(url) {
		jsonResponse, err := instagram.Extract(url)
		if err != nil {
			ctx.Error(err.Error(), fasthttp.StatusInternalServerError)
			return
		}

		ctx.SetContentType("application/json")
		ctx.Write(jsonResponse)
		return
	}

	var cmd *exec.Cmd

	if utils.IsTikTokLink(url) {
		cmd = exec.Command("python3", "-Werror", "-Xdev", scriptPath, "--no-warnings", "--no-check-certificates", "--skip-download", "--dump-json", "--quiet", "--extractor-args", "tiktok:api_hostname=api16-normal-c-useast1a.tiktokv.com;app_info=7355728856979392262", url)
	} else {
		cmd = exec.Command("python3", "-Werror", "-Xdev", scriptPath, "--no-warnings", "--no-check-certificates", "--skip-download", "--dump-json", "--quiet", url)
	}
	out, err := cmd.Output()
	if err != nil {
		fmt.Println(out)
		ctx.Error(err.Error(), fasthttp.StatusInternalServerError)
		return
	}

	var videoData map[string]interface{}

	err = json.Unmarshal(out, &videoData)
	if err != nil {
		ctx.Error(err.Error(), fasthttp.StatusInternalServerError)
		return
	}

	var minifiedHTML string

	if videoData["extractor"] == "TikTok" {
		minifiedHTML, err = tiktok.Extract(videoData)
	} else if videoData["extractor"] == "facebook" {
		minifiedHTML, err = facebook.Extract(videoData)
	} else {
		minifiedHTML, err = youtube.Extract(videoData)
	}

	if err != nil {
		ctx.Error(err.Error(), fasthttp.StatusInternalServerError)
	}

	jsonResponse, err := json.Marshal(map[string]string{"html": minifiedHTML})
	if err != nil {
		ctx.Error(err.Error(), fasthttp.StatusInternalServerError)
		return
	}

	ctx.SetContentType("application/json")
	ctx.Write(jsonResponse)
}

func main() {
	router := fasthttprouter.New()
	router.GET("/fetch", handler)

	instagramRoute.RegisterInstagramRoutes(router)
	youtubeRoute.RegisterYoutubeRoutes(router)
	tiktokRoute.RegisterTiktokRoutes(router)

	log.Fatal(fasthttp.ListenAndServe(":3333", router.Handler))
}
