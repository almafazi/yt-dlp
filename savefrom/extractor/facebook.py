import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parent.parent))
import yt_dlp
from jinja2 import Environment, FileSystemLoader
import os
import json
from operator import itemgetter
from Crypto.Cipher import AES
from Crypto.Random import get_random_bytes
from Crypto.Util.Padding import pad, unpad
import base64
import htmlmin
from urllib.parse import quote
from dotenv import load_dotenv
import subprocess
from cryptography.fernet import Fernet
import hashlib
import hmac

env = Environment(loader=FileSystemLoader('html'))
load_dotenv()
layout = os.getenv('LAYOUT')

# Access environment variables
downloadbaseurl = os.getenv('DOWNLOAD_BASE_URL_FB')
yt_dlp_main_path = Path(__file__).resolve().parent.parent.parent / 'yt_dlp' / '__main__.py'

key = hashlib.sha256(b"mysecretkey").digest()
# Ensure the key is URL-safe base64 encoded
encoded_key = base64.urlsafe_b64encode(key)
cipher_suite = Fernet(encoded_key)

def nFormatter(num):
    if not num:
        return "0"
    magnitude = 0
    while abs(num) >= 1000:
        magnitude += 1
        num /= 1000.0
    return "%.2f%s" % (num, ["", "K", "M", "G", "T", "P"][magnitude])

def encrypt(string: str):
    encrypted_string = cipher_suite.encrypt(string.encode())
    return encrypted_string.decode()

def get_video_link(video_data):
    formats = video_data["formats"]
    # sort formats by format_id ascending
    formats.sort(key=lambda x: x["format_id"])
    filtered_formats = [f for f in formats if f["format_id"] in ("hd", "sd")]
    return filtered_formats

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
        str(url)
    ]
    try:
        result = subprocess.run(command, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        videoData = json.loads(result.stdout)
    except subprocess.CalledProcessError as e:
        raise Exception(f"Failed to run yt_dlp with error: {e.stderr}")
                
    print(layout)
    template = env.get_template(f'{layout}facebook.html')
    html_content = template.render(
        video_data=videoData, 
        formatDuration=format_duration, 
        encrypt=encrypt,
        nFormatter=nFormatter,
        urlencode=urlencode,
        div=div,
        videoLinks=get_video_link(videoData),
        downloadBaseUrl=downloadbaseurl
    )
    
    
    minified_html = htmlmin.minify(html_content, remove_empty_space=True)
    jsonResponse = {"html": minified_html}

    return jsonResponse