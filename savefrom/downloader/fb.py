from fastapi import APIRouter, Request
from cryptography.fernet import Fernet
from fastapi import FastAPI, HTTPException, Response, Query
from fastapi.responses import FileResponse
from fastapi.responses import StreamingResponse
import requests
from datetime import datetime
import os
import httpx
import secrets
import re
import base64
import asyncio
from aiohttp import ClientSession, ClientTimeout
from typing import Any
from typing import Optional
from aiohttp import web

from cryptography.fernet import Fernet
import hashlib
import hmac
from base64 import urlsafe_b64encode, urlsafe_b64decode

router = APIRouter()

key = hashlib.sha256(b"mysecretkey").digest()
# Ensure the key is URL-safe base64 encoded
encoded_key = base64.urlsafe_b64encode(key)
cipher_suite = Fernet(encoded_key)

def decrypt(encrypted_string: str):
    decrypted_string = cipher_suite.decrypt(encrypted_string.encode())
    return decrypted_string.decode()

def remove_symbols_and_strange_letters(name: str) -> str:
    # Remove symbols and strange letters similar to the Go version
    symbols_removed = re.sub(r'[^\w\s]', '', name)
    strange_letters_removed = re.sub(r'[^\x00-\x7F]', '', symbols_removed)
    return strange_letters_removed

def get_file_stream(file_url: str, content_type: str):
    # Fetch content from the URL
    response = requests.get(file_url, stream=True)
    if response.status_code != 200:
        raise HTTPException(status_code=response.status_code, detail="Failed to fetch content from the provided URL.")

    # Yield the content in chunks
    for chunk in response.iter_content(chunk_size=1024):
        if chunk:
            yield chunk

@router.get("/fb/downloadurl")
async def download_handler(link: Optional[str] = Query(None), title: Optional[str] = Query(None)):

    if (not link or not title):
        raise HTTPException(status_code=400, detail="Invalid request.")

    file_url = decrypt(link)
    file_name = f"{title}.mp4"
    content_type = "video/mp4"

    return StreamingResponse(get_file_stream(file_url, content_type), media_type=content_type, headers={"Content-Disposition": f'attachment; filename="{file_name}"'})