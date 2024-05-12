from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import sys
import logging

# Add the parent directory to sys.path to make the yt_dlp module importable
parent_dir = str(Path(__file__).resolve().parent.parent)
if parent_dir not in sys.path:
    sys.path.append(parent_dir)

import yt_dlp
import json
from utils.utils import is_instagram_url, is_tiktok_link, is_youtube_link, is_facebook_link, is_x_url
from extractor.tiktok import extract as extract_tiktok
from extractor.youtube import extract as extract_youtube
from extractor.instagram import extract as extract_instagram
from extractor.facebook import extract as extract_facebook
from extractor.x import extract as extract_x

app = FastAPI()

from downloader.tiktok import router as tiktok_downloader_router 
app.include_router(tiktok_downloader_router)  

from downloader.instagram import router as instagram_downloader_router 
app.include_router(instagram_downloader_router)  

from downloader.fb import router as facebook_downloader_router 
app.include_router(facebook_downloader_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

@app.get("/fetch")
async def fetch(url: str):
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")

    if is_instagram_url(url):
        try:
            jsonResponse = extract_instagram(url)  
            return JSONResponse(content=jsonResponse)
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    if is_tiktok_link(url):
        try:
            jsonResponse = extract_tiktok(url)  
            return JSONResponse(content=jsonResponse)
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    if is_youtube_link(url):
        try:
            jsonResponse = extract_youtube(url)  
            return JSONResponse(content=jsonResponse)
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    if is_facebook_link(url):
        try:
            jsonResponse = extract_facebook(url)  
            return JSONResponse(content=jsonResponse)
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))


    if is_x_url(url):
        try:
            jsonResponse = extract_x(url)  
            return JSONResponse(content=jsonResponse)
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))