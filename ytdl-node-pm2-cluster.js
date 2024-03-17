const app = require('fastify')();
const { spawn } = require('child_process');
const Queue = require('bull');
const extractYoutubeId = require('youtube-video-id').default;
const { createBullBoard } = require('@bull-board/api');
const { BullAdapter } = require('@bull-board/api/bullAdapter');
const { FastifyAdapter } = require('@bull-board/fastify');
const fs = require('fs');
const path = require('path');
const fastifyCors = require('@fastify/cors');
const crypto = require('crypto');
const Redis = require("ioredis");
require('dotenv').config()

    const client = new Redis({
        host: 'localhost',
        port: 6379,
        password: process.env.REDIS_PASSWORD
    });

    const serverAdapter = new FastifyAdapter();

    const queue = new Queue('yt-dlp-conversion', {
        redis: {
            host: 'localhost',
            port: 6379,
            password: process.env.REDIS_PASSWORD
        },
    });

    createBullBoard({
        queues: [new BullAdapter(queue)],
        serverAdapter: serverAdapter,
    });

    app.register(require('@fastify/static'), {
        root: __dirname,
        prefix: '/',
    });

    app.register(fastifyCors, {
        origin: '*',
    });

    serverAdapter.setBasePath('/bull-queue-2024');
    app.register(serverAdapter.registerPlugin(), { prefix: '/bull-queue-2024' });

    app.get('/check-folder/:id', async (request, reply) => {
        const { id } = request.params;
        
        // Validate that id exists
        if (!id) {
            reply.status(400).send({ message: 'id is required' });
            return;
        }
        
        const folderPath = path.join(__dirname, 'converted', id);
        try {
            const folderExists = fs.existsSync(folderPath);
            if (!folderExists) {
                reply.send({ exists: false });
                return;
            }
            const files = fs.readdirSync(folderPath);
            const mp3File = files.find(file => path.extname(file) === '.mp3');
            const containsMp3 = mp3File;
            const mp3Path = containsMp3 ? path.join('converted', id, mp3File) : null;

            const bufferMP3 = encrypt(mp3Path);
            await client.del(bufferMP3);

            reply.send({ exists: true, containsMp3, mp3Path: bufferMP3 });
        } catch (error) {
            console.error(`Failed to check folder: ${error.message}`);
            reply.status(500).send({ message: 'Internal Server Error' });
        }
    });

    app.post('/convert', async (request, reply) => {
        const { youtubeUrl } = request.body;
        const youtubeId = extractYoutubeId(youtubeUrl);
        if (!youtubeUrl) {
            reply.status(400).send({ message: 'youtubeUrl is required' });
            return;
        }
        if (!validateYouTubeUrl(youtubeUrl)) {
            reply.status(400).send({ message: 'Invalid youtubeUrl' });
            return;
        }

        const outputPath = `./converted/${youtubeId}/%(title)s.%(ext)s`;

        const job = await queue.add({ youtubeUrl, outputPath, directoryPath: `./converted/${youtubeId}` }, { jobId: youtubeId, removeOnFail: {
            age: 15 * 60, // keep up to 15 minutes
        }});

        reply.send({ jobId: job.id });
    });

    app.get('/check/:jobId', async (request, reply) => {
        const { jobId } = request.params;
        const job = await queue.getJob(jobId);

        if (!job) {
            reply.status(404).send({ message: 'Job not found' });
            return;
        }

        const progress = await job.progress();
        const status = await job.getState();

        reply.send({ progress, status });
    });

    app.get('/get-file', async (request, reply) => {
        const { dlink } = request.query;

        // Check if the token has been used or expired
        const check = await client.get(dlink);
        if (check) {
            reply.status(422).send({
                'error': 'link has been used or expired. Please request a new link.'
            });
            return;
        }

        // Mark the token as used and set it to expire 5 minutes
        await client.set(dlink, 'USED', 'EX', 5 * 60);

        // Decrypt the token to get the file path
        const filePath = decrypt(dlink);
        const fileName = path.basename(filePath);

        // Send the file
        reply.header('Content-Length', fs.statSync(filePath).size);
        reply.header('Content-Transfer-Encoding', 'binary');
        return reply.download(filePath, fileName);
    });

    app.get('/download/:jobId', async (request, reply) => {
        const { jobId } = request.params;
        const job = await queue.getJob(jobId);

        if (!job) {
            reply.status(404).send({ message: 'Job not found' });
            return;
        }

        const status = await job.getState();

        if (status !== 'completed') {
            reply.status(400).send({ message: 'Job is not completed yet' });
            return;
        }

        const outputPath = job.data.outputPath;
        const directoryPath = job.data.directoryPath;
        const downloadUrl = generateDownloadUrl(outputPath, directoryPath);
        const dlink = encrypt(downloadUrl);
        await client.del(dlink);

        reply.send({ downloadUrl: dlink });
    });

    function generateDownloadUrl(outputPath, directoryPath) {
        const files = fs.readdirSync(directoryPath);
        const mp3Files = files.filter(file => path.extname(file) === '.mp3');
        if (mp3Files.length === 0) {
            throw new Error('No MP3 files found in the directory');
        }
        const mp3File = mp3Files[0];
        const downloadUrl = path.join(directoryPath, mp3File);
        return downloadUrl;
    }

    async function convertToMp3(youtubeUrl, outputPath, job) {
        return new Promise((resolve, reject) => {
            const proxyUrl = 'http://hwbknjxk-rotate:wcpjh6lq5loy@p.webshare.io:80';
            const process = spawn('./yt-dlp.sh', [
                '--break-match-filters', 'duration <= 950',
                '-f', 'bestaudio/best',
                '--extract-audio',
                '--audio-format', 'mp3',
                '--audio-quality', '192',
                '--embed-thumbnail', // Add this line to enable adding album art
                '--max-filesize', '50M',
                '-o', outputPath,
                '--proxy', proxyUrl, // Add this line to set the proxy
                youtubeUrl
            ]);

            process.stderr.on('data', (data) => {
                console.error(`Process error: ${data}`);
                job.log(`Process error: ${data}`);
            });

            process.error.on('data', (data) => {
                console.error(`Process error: ${data}`);
                job.log(`Process error: ${data}`);
            });

            process.on('exit', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Conversion failed with exit code ${code}`));
                }
            });

            process.stdout.on('data', (data) => {
                console.log(`Process output: ${data}`);
            });
        });
    }

    queue.process(8, async (job) => {
        const { youtubeUrl, outputPath } = job.data;

        try {
            await convertToMp3(youtubeUrl, outputPath, job);
        } catch (error) {
            console.error(`Failed to convert ${youtubeUrl} to MP3: ${error.message}`);
            throw error;
        }
    });

    function encrypt(text) {
        const key = crypto.scryptSync('encryption key', 'salt', 32);
        const cipher = crypto.createCipheriv('aes-256-cbc', key, Buffer.alloc(16));
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return encrypted;
    }
    
    function decrypt(text) {
        const key = crypto.scryptSync('encryption key', 'salt', 32);
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.alloc(16));
        let decrypted = decipher.update(text, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    function validateYouTubeUrl(urlToParse) {
        if (urlToParse) {
            var regExp = /^(?:https?:\/\/)?(?:m\.|www\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))((\w|-){11})(?:\S+)?$/;
            if (urlToParse.match(regExp)) {
                return true;
            }
        }
        return false;
    }

    app.listen({ port: 3007 }, (err) => {
        if (err) {
            console.error('Failed to start server:', err);
            process.exit(1);
        }
        console.log('Server is listening on port 3007');
    });
