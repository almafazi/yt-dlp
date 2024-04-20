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
downloadbaseurl = os.getenv('DOWNLOAD_BASE_URL_TIKTOK')
yt_dlp_main_path = Path(__file__).resolve().parent.parent.parent / 'yt_dlp' / '__main__.py'

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
        'python3', '-Werror', '-Xdev', str(yt_dlp_main_path),
        '--no-warnings', '--no-check-certificates', '--skip-download',
        '--dump-json', '--quiet',
        '--extractor-args', 'tiktok:api_hostname=api16-normal-c-useast1a.tiktokv.com;app_info=7355728856979392262',
        str(url)
    ]
    try:
        result = subprocess.run(command, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        videoData = json.loads(result.stdout)
    except subprocess.CalledProcessError as e:
        raise Exception(f"Failed to run yt_dlp with error: {e.stderr}")
                
    template = env.get_template('tiktok.html')
    html_content = template.render(
        video_data=videoData, 
        formatDuration=format_duration, 
        encrypt=encrypt,
        urlencode=urlencode,
        div=div,
        videoLink=get_video_link,
        downloadBaseUrl=downloadbaseurl
    )
    
    
    minified_html = htmlmin.minify(html_content, remove_empty_space=True)
    jsonResponse = {"html": minified_html}

    return jsonResponse