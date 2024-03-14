import yt_dlp
import os
import time

start_time = time.time()

URL = 'https://www.youtube.com/watch?v=n4RjJKxsamQ'
output_folder = os.path.join(os.path.dirname(__file__), 'converted')
os.makedirs(output_folder, exist_ok=True)

ydl_opts = {
    'format': 'bestaudio/best',
    'postprocessors': [{
        'key': 'FFmpegExtractAudio',
        'preferredcodec': 'mp3',
        'preferredquality': '192',
    }],
    'outtmpl': os.path.join(output_folder, '%(id)s', '%(title)s.%(ext)s'),
    'socket_timeout': 10,
    'external_downloader_args': ['-r', '400K'],
}

with yt_dlp.YoutubeDL(ydl_opts) as ydl:
    ydl.download([URL])

end_time = time.time()
execution_time = end_time - start_time
print(f"Execution time: {execution_time} seconds")