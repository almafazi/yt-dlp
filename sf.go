package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os/exec"

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

func handler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
	w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")

	url := r.URL.Query().Get("url")
	if url == "" {
		http.Error(w, "URL is required", http.StatusBadRequest)
		return
	}

	if utils.IsInstagramURL(url) {
		jsonResponse, err := instagram.Extract(url)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.Write(jsonResponse)
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
		fmt.Println(string(out))
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	var videoData map[string]interface{}

	err = json.Unmarshal(out, &videoData)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
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
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}

	jsonResponse, err := json.Marshal(map[string]string{"html": minifiedHTML})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write(jsonResponse)
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/fetch", handler)

	// Register routes for Instagram, YouTube, and TikTok
	instagramRoute.RegisterInstagramRoutes(mux)
	youtubeRoute.RegisterYoutubeRoutes(mux)
	tiktokRoute.RegisterTiktokRoutes(mux)

	log.Fatal(http.ListenAndServe(":3333", mux))
}
