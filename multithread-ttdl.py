import json
import yt_dlp
from flask import Flask, request, jsonify, render_template
import base64
import multiprocessing

import concurrent.futures

app = Flask(__name__)


def nFormatter(num):
    magnitude = 0
    while abs(num) >= 1000:
        magnitude += 1
        num /= 1000.0
    return "%.2f%s" % (num, ["", "K", "M", "G", "T", "P"][magnitude])


def heavy_function(url, menu, download_url):

    ydl_opts = {"quiet": True}
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
    # return jsonify(info)
    audio = info.get("audio", [])
    formats = info.get("formats", [])
    photos = info.get("photos", [])

    if photos and isinstance(photos, list) and len(photos) > 0:
        wm_video_url = info.get("url")
        nwm_video_url = info.get("url")

        photos = map(
            lambda item: {
                "download_url": download_url
                + "?imglink="
                + base64.b64encode(item["url"].encode()).decode()
                + "&author="
                + info.get("creator"),
                **item,
            },
            photos,
        )

        download_data = {
            "wm_video_url": download_url
            + "?link="
            + base64.b64encode(wm_video_url.encode()).decode()
            + "&author="
            + info.get("creator"),
            "nwm_video_url": download_url
            + "?link="
            + base64.b64encode(nwm_video_url.encode()).decode()
            + "&author="
            + info.get("creator"),
            "audio_url": download_url
            + "?musiclink="
            + base64.b64encode(audio.get("uri").encode()).decode()
            + "&author="
            + info.get("creator"),
        }

        return {"info": info, "download_data": download_data, "photos": photos}

    else:

        filtered_formats = [
            f for f in formats if "watermarked" in f.get("format_note", "")
        ]
        sorted_formats = sorted(
            filtered_formats, key=lambda f: f.get("width", 0), reverse=True
        )
        selected_format = sorted_formats[0] if sorted_formats else None
        wm_video_url = selected_format.get("url") if selected_format else None

        selected_format = max(
            (f for f in formats if "watermarked" not in f.get("format_note", "")),
            key=lambda f: f.get("width", 0),
            default=None,
        )
        nwm_video_url = selected_format.get("url") if selected_format else None

        download_data = {
            "wm_video_url": download_url
            + "?link="
            + base64.b64encode(wm_video_url.encode()).decode()
            + "&author="
            + info.get("creator"),
            "nwm_video_url": download_url
            + "?link="
            + base64.b64encode(nwm_video_url.encode()).decode()
            + "&author="
            + info.get("creator"),
            "audio_url": download_url
            + "?musiclink="
            + base64.b64encode(audio.get("uri").encode()).decode()
            + "&author="
            + info.get("creator"),
        }

        return {"info": info, "download_data": download_data}


@app.route("/tiktok")
def handle_request():
    url = request.args.get("url")
    menu = request.args.get("menu")
    download_url = request.args.get("download_url")
    num_cores = multiprocessing.cpu_count()

    with concurrent.futures.ThreadPoolExecutor(max_workers=num_cores) as executor:
        future = executor.submit(heavy_function, url, menu, download_url)

        result = future.result()

    if result.get("photos"):
        return jsonify(
            {
                "html": render_template(
                    "response-photos.html",
                    info=result.get("info"),
                    nFormatter=nFormatter,
                    download_data=result.get("download_data"),
                    menu=menu,
                    download_url=download_url,
                    photos=result.get("photos"),
                )
            }
        )
    else:
        return jsonify(
            {
                "html": render_template(
                    "response.html",
                    info=result.get("info"),
                    nFormatter=nFormatter,
                    download_data=result.get("download_data"),
                    menu=menu,
                    download_url=download_url,
                )
            }
        )


if __name__ == "__main__":
    app.run(port=3008)
