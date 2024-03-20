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
const os = require('os');
const disk = require('diskusage');
const osUtils = require('os-utils');
const rateLimit = require('express-rate-limit');
const fastifyAdapter = require('@fastify/express');

require('dotenv').config()

    const MAX_PROCCESS = parseInt(process.env.MAX_PROCCESS) || 1;

    const client = new Redis({
        host: 'localhost',
        port: 6379,
        password: process.env.REDIS_PASSWORD
    });

    const serverAdapter = new FastifyAdapter();

    const queue = new Queue(process.env.QUEUE_NAME, {
        redis: {
            host: process.env.QUEUE_HOST,
            port: 6379,
            password: process.env.QUEUE_PASSWORD
        },
    });

    let queueList = [new BullAdapter(queue)];


    if(process.env.MAIN_SERVER) {
         node2 = new Queue(process.env.QUEUE_NAME_SECONDARY, {
            redis: {
                host: process.env.QUEUE_HOST_SECONDARY,
                port: 6379,
                password: process.env.QUEUE_PASSWORD_SECONDARY,
            },
        });
        queueList = [new BullAdapter(queue), new BullAdapter(node2)];
    }

    createBullBoard({
        queues: queueList,
        serverAdapter: serverAdapter,
    });

    app.register(require('@fastify/static'), {
        root: __dirname,
        prefix: '/',
    });

    // app.register(fastifyAdapter).after(() => {
    //     app.use(rateLimit({
    //       windowMs: 60 * 1000, // 1 minute
    //       max: 5, // limit each IP to 5 requests per windowMs
    //       message: "Too many requests, please try again later."
    //     }));
    //   });

    const allowedDomains = ['https://node1.canehill.info', 'https://node2.canehill.info'];

    // app.register(fastifyCors, {
    // origin: function(origin, callback){
    //     console.log(origin);
    //     if(!origin) return callback(null, true);
    //     if(allowedDomains.indexOf(origin) === -1){
    //     const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
    //     return callback(new Error(msg), false);
    //     }
    //     return callback(null, true);
    // }
    // });

    // app.addHook('preHandler', (request, reply, done) => {
    //     // Check if the request is an AJAX request
    //     if (request.headers['x-requested-with'] !== 'XMLHttpRequest' && request.headers['x-requested-with'] !== undefined){
    //         // Check if the request is coming from the load balancer
    //         const loadBalancerIp = process.env.LOAD_BALANCER_IP;
    //         const clientIp = request.headers['x-forwarded-for'] || request.ip;
    //         if (clientIp !== loadBalancerIp) {
    //             reply.code(403).send('This API can only be accessed via AJAX or the load balancer.');
    //             return;
    //         }
    //     }
    //     done();
    // });

    serverAdapter.setBasePath('/bull-queue-2024');
    app.register(serverAdapter.registerPlugin(), { prefix: '/bull-queue-2024' });

    app.get('/health', async (request, reply) => {
        try {
            // const totalMemory = os.totalmem();
            // const freeMemory = os.freemem();
            // const usedMemory = totalMemory - freeMemory;
            // const memoryUsagePercent = (usedMemory / totalMemory) * 100;
    
            const cpuUsagePromise = new Promise((resolve, reject) => {
                osUtils.cpuUsage((cpuUsage) => {
                    resolve(cpuUsage);
                });
            });
    
            const diskUsagePromise = new Promise((resolve, reject) => {
                disk.check('/', (err, info) => {
                    if (err) reject(err);
                    resolve(info);
                });
            });
    
            const [cpuUsage, diskUsage] = await Promise.all([cpuUsagePromise, diskUsagePromise]);
    
            // Define your thresholds
            const cpuThreshold = 75; // 80% usage
            const memoryThreshold = 100; // 80% usage
            const diskThreshold = 75; // 80% usage
    
            // Determine health status based on thresholds
            let healthStatus = 'healthy';
            if (cpuUsage * 100 > cpuThreshold) {
                healthStatus = 'unhealthy';
            } 
            // else if (memoryUsagePercent > memoryThreshold) {
            //     healthStatus = 'unhealthy';
            // } 
            else if ((diskUsage.total - diskUsage.free) / diskUsage.total > diskThreshold / 100) {
                healthStatus = 'unhealthy';
            }
    
            reply.send({
                healthStatus: healthStatus
            });
        } catch (error) {
            reply.send({
                healthStatus: 'unhealthy'
            });
        }
    });

    app.get('/filecheckcdn/:id', async (req, reply) => {
        const id = req.params.id;

        try {
            const folderPath = path.join(__dirname, 'converted', id);
            const folderExists = fs.existsSync(folderPath);
            let mp3file = null;
            
            if(folderExists) {
                const files = fs.readdirSync(folderPath);
                mp3file = files.find(file => path.extname(file) === '.mp3');
            } else {
                reply.status(404);
            }

            if (folderExists || mp3file) {
                const containsMp3 = mp3file;
                const mp3Path = containsMp3 ? path.join('converted', id, mp3file) : null;
                const bufferMP3 = encrypt(mp3Path);
                await client.del(bufferMP3);

                reply.send({ exists: true, containsMp3, mp3Path: bufferMP3, server: process.env.SERVER_ENDPOINT });
            } else {
                reply.status(404);
            }
    
        } catch (error) {
            reply.status(404);
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

        const id = youtubeId;

        try {
            const folderPath = path.join(__dirname, 'converted', id);
            const folderExists = fs.existsSync(folderPath);
            let mp3file = null;
            
            if(folderExists) {
                const files = fs.readdirSync(folderPath);
                mp3file = files.find(file => path.extname(file) === '.mp3');
            }

            if (!folderExists || !mp3file) {
                const outputPath = `./converted/${youtubeId}/%(title)s.%(ext)s`;

                const existingJob = await queue.getJob(youtubeId);
                if (existingJob) {
                    const status = await existingJob.getState();
                    if (status === 'completed') {
                        await existingJob.remove();
                    }
                }

                const job = await queue.add({ youtubeUrl, outputPath, directoryPath: `./converted/${youtubeId}` }, { jobId: youtubeId, removeOnFail: {
                    age: 15 * 60, // keep up to 15 minutes
                }});

                reply.send({ exists: false, jobId: job.id });
                return;
            } else {
                const containsMp3 = mp3file;
                const mp3Path = containsMp3 ? path.join('converted', id, mp3file) : null;
                const bufferMP3 = encrypt(mp3Path);
                await client.del(bufferMP3);

                reply.send({ exists: true, containsMp3, mp3Path: bufferMP3, server: process.env.SERVER_ENDPOINT });
            }
    
        } catch (error) {
            reply.status(500).send({ message: `Failed to check folder: ${error.message}` });
        }
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
            const proxyUrl = 'http://mdjxjxut-rotate:7ffa95jej8l5@p.webshare.io:80';
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

            let breakTerminal = false;

            process.on('exit', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Conversion failed with exit code ${code}`));
                }
            });

            process.stdout.on('data', (data) => {
                job.log(data);
                const progressRegex = /(\d+(\.\d+)?)%/;
                const match = data.toString().match(progressRegex);

                if (match) {
                    const percentage = parseFloat(match[1]);
                    job.progress(`Downloading ${percentage}%`);
                }

                
                const breakRegex = /\[info\] Encountered a video that did not match filter, stopping due to --break-match-filter/;
                const breakRegexMatch = data.toString().match(breakRegex);
                if (breakRegexMatch) {
                    breakTerminal = true;
                    job.progress(`Error, max video duration is 15 minutes.`);
                }

                const youtubeRegex = /\[youtube\] (.*)/;
                const youtubeMatch = data.toString().match(youtubeRegex);
                if (youtubeMatch) {
                    job.progress(`Getting info...`);
                }

                const infoRegex = /\[info\] (.*)/;
                const infoMatch = data.toString().match(infoRegex);
                if (infoMatch) {
                    if(breakTerminal == false) {
                        job.progress(`Downloading Thumbnail...`);
                    }
                }

                const ExtractAudioRegex = /\[ExtractAudio\] (.*)/;
                const ExtractAudioMatch = data.toString().match(ExtractAudioRegex);
                if (ExtractAudioMatch) {
                    job.progress(`Converting...`);
                }
                const ThumbnailsConvertorRegex = /\[ThumbnailsConvertor\] (.*)/;
                const ThumbnailsConvertorMatch = data.toString().match(ThumbnailsConvertorRegex);
                if (ThumbnailsConvertorMatch) {
                    job.progress(`Starting Download...`);
                }
            });

            process.stderr.on('data', (data) => {
                console.error(`Process error: ${data}`);
              //  reject(new Error(`Process error: ${data}`));
            });

            process.on('uncaughtException', (err, origin) => {
                console.error(`Process errorun: ${data}`);

            });
        });
    }

    queue.process(MAX_PROCCESS, async (job) => {
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
