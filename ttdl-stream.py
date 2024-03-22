from flask import Flask, Response
import subprocess

app = Flask(__name__)

@app.route('/video')
def video():
    url = "https://www.tiktok.com/@eko_graji12/video/7320567633982541061?is_from_webapp=1&sender_device=pc"
    command = ["yt-dlp", "-f", "best", "-o", "-", url]
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    def generate():
        for chunk in iter(lambda: process.stdout.read(4096), b''):
            yield chunk
    response = Response(generate(), mimetype="video/mp4")
    response.headers.set('Content-Disposition', 'attachment', filename='video.mp4')
    return response

if __name__ == '__main__':
    app.run(port=5000)