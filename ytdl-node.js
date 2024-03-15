const app = require('fastify')({logger: true})
const { spawn } = require('child_process');
const Queue = require('bull');
const extractYoutubeId = require('youtube-video-id').default;
const { createBullBoard } = require('@bull-board/api');
const { BullAdapter } = require('@bull-board/api/bullAdapter');
const { FastifyAdapter } = require('@bull-board/fastify');
const fs = require('fs');
const path = require('path');
const fastifyCors = require('@fastify/cors');

const serverAdapter = new FastifyAdapter();
serverAdapter.setBasePath('/admin/queues');

const queue = new Queue('yt-dlp-conversion', {
    redis: {
        host: 'localhost',
        port: 6379,
        password: '!Rahman214'
    },
});

createBullBoard({
  queues: [new BullAdapter(queue)],
  serverAdapter: serverAdapter,
});

app.register(require('@fastify/static'), {
    root: __dirname,
    prefix: '/',
})

app.register(fastifyCors, {
    origin: '*',
});

serverAdapter.setBasePath('/ui');
app.register(serverAdapter.registerPlugin(), { prefix: '/ui' });

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

    const job = await queue.add({ youtubeUrl, outputPath, directoryPath: `./converted/${youtubeId}` }, {jobId: youtubeId, removeOnFail: true});
    
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
    const outputPath = Buffer.from(dlink, 'base64').toString('utf-8');
    const realFile = `${__dirname}/${outputPath}`;
    const fileName = path.basename(realFile);

    return reply.download(outputPath, fileName);

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
    const encodedUrl = Buffer.from(downloadUrl).toString('base64');

    reply.send({ downloadUrl: encodedUrl });
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

async function convertToMp3(youtubeUrl, outputPath) {
    return new Promise((resolve, reject) => {
        const proxyUrl = 'http://hwbknjxk-rotate:wcpjh6lq5loy@p.webshare.io:80';
        const process = spawn('./yt-dlp.sh', [
            '-f', 'bestaudio/best',
            '--extract-audio',
            '--audio-format', 'mp3',
            '--audio-quality', '192',
            '--embed-thumbnail', // Add this line to enable adding album art
            '-o', outputPath,
            '--proxy', proxyUrl, // Add this line to set the proxy
            youtubeUrl
        ]);

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

        process.stderr.on('data', (data) => {
            console.error(`Process error: ${data}`);
        });
    });
}

queue.process(3, async (job) => {
    const { youtubeUrl, outputPath } = job.data;

    try {
        await convertToMp3(youtubeUrl, outputPath);
    } catch (error) {
        console.error(`Failed to convert ${youtubeUrl} to MP3: ${error.message}`);
        throw error;
    }
});

function validateYouTubeUrl(urlToParse){
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