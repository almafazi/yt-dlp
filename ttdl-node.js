const { exec } = require('child_process');
const fastify = require('fastify')();
const Redis = require('ioredis');

// Create a Redis client
const redis = new Redis();

const getVideoInfo = async (url) => {
    // Check if the response is already cached in Redis
    const cachedResponse = await redis.get(url);
    if (cachedResponse) {
        return JSON.parse(cachedResponse);
    }

    const proxy = 'http://ztgvzxrb-rotate:8tmkgjfb6k44@p.webshare.io:80';
    const command = `./yt-dlp.sh --skip-download --dump-json --quiet --proxy ${proxy} ${url}`;

    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error executing command: ${error.message}`);
                reject(error);
                return;
            }

            if (stderr) {
                try {
                    const videoInfo = JSON.parse(stdout);
                    // Cache the response in Redis for 5 minutes
                    redis.set(url, JSON.stringify(videoInfo), 'EX', 300);
                    resolve(videoInfo);
                } catch (error) {
                    console.error(`Command execution returned an error: ${stderr}`);
                    reject(error);
                }
                return;
            }
        });
    });
};

fastify.post('/tiktok', async (request, reply) => {
    const { url } = request.body;
    if (!url) {
        reply.code(400).send('Missing video URL');
        return;
    }

    try {
        const videoInfo = await getVideoInfo(url);
        reply.send(videoInfo);
    } catch (error) {
        reply.code(500).send({ error: 'Url not valid.' });
    }
});

fastify.listen(3000, (err) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    console.log('Server is running on port 3000');
});