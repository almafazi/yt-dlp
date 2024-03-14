import yt_dlp
import os
from flask import Flask, request, jsonify
from celery import Celery
import yt_dlp
import os

app = Flask(__name__)
app.config['CELERY_BROKER_URL'] = 'redis://localhost:6379/0'
app.config['CELERY_RESULT_BACKEND'] = 'redis://localhost:6379/0'
celery = Celery(app.name, broker=app.config['CELERY_BROKER_URL'])
celery.conf.update(app.config)

@celery.task(bind=True)
def convert_to_mp3(self, url):
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
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])

@app.route('/convert', methods=['POST'])
def convert():
    url = request.form.get('url')
    task = convert_to_mp3.apply_async(args=[url])
    return jsonify({'task_id': task.id}), 202

@app.route('/check/<task_id>', methods=['GET'])
def check(task_id):
    task = convert_to_mp3.AsyncResult(task_id)
    response = {
        'state': task.state,
        'progress': task.info.get('progress', 0),
        'download_url': None
    }
    if task.state == 'SUCCESS':
        download_url = os.path.join('/converted', task.info['id'], task.info['title'] + '.mp3')
        response['download_url'] = download_url
    return jsonify(response)

if __name__ == '__main__':
    app.run()