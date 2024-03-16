import Fastify from 'fastify';
import Redis from 'ioredis';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import { renderFile as render_template } from 'ejs';
import cluster from 'cluster';
import os from 'os';

if (cluster.isPrimary) {
    const numWorkers = os.cpus().length;

    console.log(`Master ${process.pid} is running`);

    // Fork workers
    for (let i = 0; i < numWorkers; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died`);
        console.log('Forking a new worker...');
        cluster.fork();
    });
} else {

const exec = promisify(execCb);

function nFormatter(num) {
    let magnitude = 0;
    while (Math.abs(num) >= 1000) {
        magnitude += 1;
        num /= 1000.0;
    }
    return `${num.toFixed(2)}${["", "K", "M", "G", "T", "P"][magnitude]}`;
}

const app = Fastify({ logger: true });
const redis = new Redis({
    port: 6379,
    host: "127.0.0.1",
    password: process.env.REDIS_PASSWORD 
});

await app.register(import('@fastify/rate-limit'), {
    max: 3,
    timeWindow: '1 minute'
})

app.setErrorHandler(function (error, request, reply) {
    if (error.statusCode === 429) {
      reply.code(429)
      error.message = 'You hit the rate limit! Slow down please!'
    }
    reply.send(error)
})

app.post('/extract', async (request, reply) => {
    const { url, download_url, website_url, menu } = request.body;
    if (!url || !download_url || !website_url) {
        return reply.code(400).send({ error: 'some params required' });
    }

    const cachedResult = await redis.get(url);
    if (cachedResult) {
        const info = JSON.parse(cachedResult);
        const renderedHtml = await getRenderHtml(info, website_url, download_url, menu);
        return reply.send({ "html": renderedHtml });
    }
    try {
        const { stdout, stderr } = await extractInfo(url);
        if(!stdout && !stderr) {
            return reply.status(500).send({ "error": "Empty response." });
        }
        if(!JSON.parse(stdout)) {
            if(stderr) {
                stdout = stderr;
            }
        }
        await redis.set(url, stdout, 'EX', 300);
        const info = JSON.parse(stdout);
        const renderedHtml = await getRenderHtml(info, website_url, download_url, menu);
        return reply.send({ "html": renderedHtml });

    } catch (error) {
        return reply.status(500).send({ "error": error });
    }
});

async function responseParser(info, download_url) {
    const audio = info.audio || [];
    const formats = info.formats || [];
    const photos = info.photos || [];

    if (photos && Array.isArray(photos) && photos.length > 0) {
        const wm_video_url = info.url;
        const nwm_video_url = info.url;

        const mappedPhotos = photos.map(item => {
            return {
                download_url: download_url + "?imglink=" + Buffer.from(item.url).toString('base64') + "&author=" + info.creator,
                ...item
            };
        });

        const download_data = {
            wm_video_url: download_url + "?link=" + Buffer.from(wm_video_url).toString('base64') + "&author=" + info.creator,
            nwm_video_url: download_url + "?link=" + Buffer.from(nwm_video_url).toString('base64') + "&author=" + info.creator,
            audio_url: download_url + "?musiclink=" + Buffer.from(audio.uri).toString('base64') + "&author=" + info.creator
        };

        return { info, download_data, photos: mappedPhotos };
    } else {
        const filtered_formats = formats.filter(f => f.format_note.includes("watermarked"));
        const sorted_formats = filtered_formats.sort((a, b) => b.width - a.width);
        const selected_format = sorted_formats[0] || null;
        let wm_video_url = selected_format ? selected_format.url : null;
        if (!wm_video_url) {
            wm_video_url = formats[0].url;
        }

        const nwm_format = formats.find(f => !f.format_note.includes("watermarked"));
        const nwm_video_url = nwm_format ? nwm_format.url : null;
        if (!nwm_video_url) {
            nwm_video_url = formats[1].url;
        }

        const download_data = {
            wm_video_url: download_url + "?link=" + Buffer.from(wm_video_url).toString('base64') + "&author=" + info.creator,
            nwm_video_url: download_url + "?link=" + Buffer.from(nwm_video_url).toString('base64') + "&author=" + info.creator,
            audio_url: download_url + "?musiclink=" + Buffer.from(audio.uri).toString('base64') + "&author=" + info.creator
        };

        return { info, download_data };
    }
}
async function extractInfo(url) {
    try {
        const proxy = '--proxy http://ztgvzxrb-rotate:8tmkgjfb6k44@p.webshare.io:80';
        const { stdout, stderr } = await exec(`./yt-dlp.sh --no-warnings --no-check-certificates --skip-download --dump-json --quiet ${proxy} ${url}`);
        return { stdout, stderr };
    } catch (error) {
        throw error;
    }
}

async function getRenderHtml(info, website_url, download_url, menu) {

    const result = await responseParser(info, download_url);
    return await new Promise((resolve, reject) => {
        render_template((result.photos ? 'response/response-photos.ejs' : 'response/response.ejs'), {
            info: result.info,
            nFormatter: nFormatter,
            website_url: website_url,
            download_data: result.download_data,
            menu: menu,
            download_url: download_url,
            photos: result.photos
        }, (err, html) => {
            if (err) {
                reject(err);
            } else {
                resolve(html);
            }
        });
    });
}

// Start the server
app.listen({'port': 3013}, (err) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    console.log('Server is running on port 3013');
});

}