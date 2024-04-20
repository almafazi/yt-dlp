import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parent.parent))
import yt_dlp
from jinja2 import Environment, FileSystemLoader
import os
import json
from Crypto.Cipher import AES
from Crypto.Random import get_random_bytes
from Crypto.Util.Padding import pad, unpad
import base64
import htmlmin
from base64 import urlsafe_b64encode, urlsafe_b64decode
from urllib.parse import quote
from dotenv import load_dotenv
import subprocess
from cryptography.fernet import Fernet
import hashlib
import hmac

env = Environment(loader=FileSystemLoader('html'))
load_dotenv()

# Access environment variables
imagebaseurl = os.getenv("IMAGE_BASE_URL")
downloadbaseurl = os.getenv("DOWNLOAD_BASE_URL")

gallery_dl_main_path = Path(__file__).resolve().parent.parent.parent / 'gallery-dl' / 'gallery-dl'
cookie_path = Path(__file__).resolve().parent.parent.parent / 'gallery-dl' / 'cookies' / 'cookies.txt'

key = hashlib.sha256(b"mysecretkey").digest()
# Ensure the key is URL-safe base64 encoded
encoded_key = base64.urlsafe_b64encode(key)
cipher_suite = Fernet(encoded_key)

def encrypt(string: str):
    encrypted_string = cipher_suite.encrypt(string.encode())
    return encrypted_string.decode()

def get_video_link(video_data, video_type):
    formats = video_data["formats"]
    filtered_formats = []

    for item in formats:
        format = item
        if video_type == "watermarked" and "watermarked" in format["format_note"]:
            filtered_formats.append(item)
        elif video_type == "nowatermarked" and "watermarked" not in format["format_note"]:
            filtered_formats.append(item)

    filtered_formats.sort(key=lambda x: x["filesize"], reverse=True)

    if not filtered_formats:
        return formats[0]
    return filtered_formats[0]

def div(a, b):
    return a / b

def urlencode(str):
    return quote(str)

def format_duration(d):
    seconds = int(d)
    minutes, seconds = divmod(seconds, 60)
    return f"{minutes:02d}:{seconds:02d}"
        
def extract(url):
            
    command = [
        str(gallery_dl_main_path),
        '--no-download', '--dump-json',
        '--cookies', str(cookie_path),
        str(url)
    ]
    try:
        result = subprocess.run(command, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        videoData = json.loads(result.stdout)
    except subprocess.CalledProcessError as e:
        raise Exception(f"Failed to run yt_dlp with error: {e.stderr}")
                
    video_data_fresh = videoData[1:]

    formatted_data = []

    for item in video_data_fresh:
        formatted_data.append({
            "video_url": item[2]["video_url"],
            "display_url": item[2]["display_url"],
            "description": item[2]["description"],
            "date": item[2]["date"],
            "username": item[2]["username"],
        })

    template = env.get_template('instagram.html')
    html_content = template.render(
        videoLinks=formatted_data, 
        formatDuration=format_duration, 
        encrypt=encrypt,
        urlencode=urlencode,
        div=div,
        downloadBaseUrl=downloadbaseurl,
        imageBaseUrl=imagebaseurl
    )
    
    minified_html = htmlmin.minify(html_content, remove_empty_space=True)
    jsonResponse = {"html": minified_html}

    return jsonResponse