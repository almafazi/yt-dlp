from fastapi import APIRouter
from cryptography.fernet import Fernet
from fastapi import FastAPI, HTTPException, Response
from fastapi.responses import FileResponse
from fastapi.responses import StreamingResponse
import httpx
import requests
from datetime import datetime
import os
import secrets
import re
import base64
import asyncio
from aiohttp import ClientSession, ClientTimeout

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

@router.get("/tiktok/downloadurl")
async def download_handler(type: str, link: str = None, musiclink: str = None, imglink: str = None, author: str = None):
    encrypted_url = link or musiclink or imglink
    if not encrypted_url or not author:
        raise HTTPException(status_code=400, detail="Missing url or name parameter")

    if type == "normal":
        ext = ".mp3" if musiclink else ".jpg" if imglink else ".mp4" if link else None
        if ext is None:
            raise HTTPException(status_code=400, detail="Invalid media type")

        # Generate the filename
        random_bytes = secrets.token_hex(3)  # Generates 6 random hex characters
        filename = f"{remove_symbols_and_strange_letters(author)} {datetime.now().strftime('%Y-%m-%d %H-%M-%S')}-{random_bytes}{ext}"

        decrypted_url = decrypt(encrypted_url)
        if not decrypted_url:
            raise HTTPException(status_code=500, detail="Failed to decrypt link")

        async def stream_response():
            timeout = ClientTimeout(total=60)  # Set a total timeout of 60 seconds
            async with ClientSession(timeout=timeout) as session:
                async with session.get(decrypted_url) as response:
                    if response.status != 200:
                        raise HTTPException(status_code=500, detail="Failed to download media")
                    async for chunk in response.content.iter_any():
                        yield chunk
                        await asyncio.sleep(0.01)  # Introduces a slight delay to manage backpressure

        headers = {
            'Content-Disposition': f'attachment; filename="{filename}"',
            'Content-Type': 'application/octet-stream',
            'Content-Transfer-Encoding': 'Binary'
        }

        return StreamingResponse(stream_response(), headers=headers)

