
import express from 'express';
import { exec } from 'child_process';
import cors from 'cors';
import crypto from 'crypto';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import axios from 'axios';
import YouTubeVideoId from 'youtube-video-id';
import Redis from 'ioredis';

dotenv.config();

const app = express();
const port = 3131;

app.set('view engine', 'ejs');

app.use(cors());
app.use(express.json());

const client = new Redis({
    host: 'localhost',
    port: 6379,
    password: process.env.REDIS_PASSWORD
});

async function checkAndProcessVideo(vid, parsedFormatId) {
    const response = await axios.post(`${process.env.CHECK_CLUSTER_URL}`, {
        youtubeUrl: `https://www.youtube.com/watch?v=${vid}`
    }, {
        headers: {
            'Content-Type': 'application/json'
        }
    });
    const serverUrl = response.headers['x-server-url'];
    const data = response.data;
    if (data.exists) {
        if (data.mp3Path) {
            return {
                "status": "ok",
                "mess": "",
                "c_status": "CONVERTED",
                "vid": vid,
                "title": "-",
                "ftype": parsedFormatId.ext,
                "fquality": parsedFormatId.id,
                "dlink": `${serverUrl}/get-file?dlink=${data.mp3Path}`,
                "server": serverUrl
            };
        }
    } else {
        if(data.jobId) {
            return {
                "b_id": data.jobId,
                "c_status": "CONVERTING",
                "e_time": null,
                "mess": "",
                "status": "ok",
                "server": serverUrl
            };
        }
    }
    return null;
}

app.post('/check', async (req, res) => {
    const { vid, b_id, server } = req.body;
    
        axios.get(server+'/check/'+b_id)
            .then(response => {
                const data = response.data;
                if(data?.status == "active") {
                    return res.json({
                        "b_id": data.jobId,
                        "c_status": "CONVERTING",
                        "e_time": null,
                        "mess": "",
                        "status": "ok",
                        "server": server
                    });
                } else if(data?.status == "completed") {
                    axios.get(server+'/download/'+b_id)
                        .then(response => {
                            if(response.data.downloadUrl) {
                                const dlink = server+'/get-file?dlink='+response.data.downloadUrl;
                                return res.json({
                                    "status": "ok",
                                    "mess": "",
                                    "c_status": "CONVERTED",
                                    "vid": vid,
                                    "title": "-",
                                    "ftype": 'mp3',
                                    "fquality":'128KBps',
                                    "dlink": dlink,
                                    "server": server
                                });				
                            }
                        })
                        .catch(error => {
                            return res.status(200).json({
                                c_status: "FAILED",
                                mess: "Sorry! An error has occurred.",
                                status: "ok"
                            });
                        });
                } else if(data?.status == "waiting"){
                    return res.json({
                        "b_id": data.jobId,
                        "c_status": "CONVERTING",
                        "e_time": null,
                        "mess": "",
                        "status": "ok",
                        "server": server
                    });
                } else {
                    return res.status(200).json({
                        c_status: "FAILED",
                        mess: "Sorry! An error has occurred.",
                        status: "ok"
                    });
                }
            })
            .catch(error => {
                console.log(error)
                return res.status(200).json({
                    c_status: "FAILED",
                    mess: "Sorry! An error has occurred.",
                    status: "ok"
                });
            });
});

app.get('/download', (req, res) => {
    const { link } = req.query;

    const data = decrypt(link);
    const parsedData = JSON.parse(data);
    if (!parsedData || !parsedData.id || !parsedData.vid) {
        return res.status(200).json({
            c_status: "FAILED",
            mess: "Sorry! An error has occurred.",
            status: "ok"
        });
    }
    const proxyUrl = 'http://mdjxjxut-rotate:7ffa95jej8l5@p.webshare.io:80';
    const command = `yt-dlp -f ${parsedData.id} --dump-json --proxy ${proxyUrl} ${parsedData.vid}`;
    exec(command, (error, stdout, stderr) => {
        if (error) {
            return res.json({
                c_status: "FAILED",
                mess: "Sorry! An error has occurred.",
                status: "ok"
            });
        }

        const videoInfo = JSON.parse(stdout);

        const videoUrl = videoInfo.url;
        const videoTitle = videoInfo.title;
        const videoFormat = videoInfo.ext;

        // Set headers to force download
        res.setHeader('Content-Disposition', `attachment; filename=${videoTitle}.${videoFormat}`);
        res.setHeader('Content-Type', `video/${videoFormat}`);

        fetch(videoUrl).then(response => {
            response.body.pipe(res);
        });
        
    });
});

app.post('/process', async (req, res) => {
    const { vid, k } = req.body;
    // Decrypt the encrypted format_id
    const formatId = decrypt(k);
    const parsedFormatId = JSON.parse(formatId);

    if (!parsedFormatId || !parsedFormatId.id || !parsedFormatId.ext) {
        return res.status(200).json({ error: 'Invalid Data' });
    }

    const ext = parsedFormatId.ext;
    if(ext == 'mp4') {
        return res.json({
            "status": "ok",
            "mess": "",
            "c_status": "CONVERTED",
            "vid": vid,
            "title": "-",
            "ftype": parsedFormatId.ext,
            "fquality": parsedFormatId.id,
            "dlink": process.env.LOCAL_DOWNLOAD_URL+"?link=" + encrypt(JSON.stringify({id:parsedFormatId.id,vid:vid})),
        });
    } else if(ext == 'mp3') {
        let result = await checkAndProcessVideo(vid, parsedFormatId);
        if(result) {
            return res.json(result);
        }
    }
});


app.post('/fetch', (req, res) => {
    let { k_query } = req.body;
    const url = k_query;


    if (!validateYouTubeUrl(k_query)) {
        return res.status(200).json({ error: 'Invalid youtubeUrl' });
    }
    k_query = YouTubeVideoId(k_query);
        if (!k_query) {
            return res.status(200).json({ error: 'youtubeUrl is required' });
        }


    client.get(k_query, (error, result) => {
        // Get YouTube video information
        const proxyUrl = 'http://mdjxjxut-rotate:7ffa95jej8l5@p.webshare.io:80';
        exec(`./yt-dlp.sh --dump-json --proxy ${proxyUrl} ${url}`, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error: ${error.message}`);
                return res.status(200).json({
                    c_status: "FAILED",
                    mess: "Sorry! An error has occurred.",
                    status: "ok"
                });
            }
            if (stderr) {
                console.error(`Error: ${stderr}`);
                return res.status(200).json({
                    c_status: "FAILED",
                    mess: "Sorry! An error has occurred.",
                    status: "ok"
                });
            }

            // Parse the JSON output of yt-dlp
            const videoInfo = JSON.parse(stdout);

            // Prepare the response in the desired format
            const response = {
                status: "ok",
                mess: "",
                page: "detail",
                vid: videoInfo.id,
                extractor: videoInfo.extractor,
                title: videoInfo.title,
                t: videoInfo.duration,
                a: videoInfo.uploader,
                links: {
                    mp4: {},
                    mp3: {},
                    other: {}
                }
            };

            // Populate the 'links' object
            videoInfo.formats.forEach(format => {
                const q = format.height ? `${format.height}p` : format.abr ? `${parseInt(format.abr)} Kbps` : 'auto';
            
                // Determine the category of the format
                let category;
                if (format.vcodec !== 'none' && format.acodec !== 'none') {
                    // The format is a video format that contains audio
                    category = 'mp4';
                } else if (format.vcodec === 'none' && format.acodec !== 'none') {
                    // The format is an audio-only format
                    category = 'mp3';
                    format.format_id = 'mp3128'; // Change format to mp3128
                    format.ext = 'mp3'
                } else if (format.vcodec !== 'none' && format.acodec === 'none' && format.ext !== 'mhtml') {
                    // The format is a video format that doesn't contain audio and is not mhtml
                    category = 'other';
                }
            
                // Initialize response.links[category] if it's undefined
                if (!response.links[category]) {
                    response.links[category] = {};
                }
            
                response.links[category][format.format_id] = {
                    size: format.filesize ? `${(format.filesize / (1024 * 1024)).toFixed(1)} MB` : format.filesize_approx ? `~ ${(format.filesize_approx / (1024 * 1024)).toFixed(1)} MB` : "~ MB",
                    f: format.ext,
                    q: q,
                    q_text: category === 'other' ? `${format.height}p (Video Only) (.${format.ext})` : format.height ? `${format.height}p (.${format.ext})` : format.abr ? `.${format.ext} (${parseInt(format.abr)} Kbps)` : `.${format.ext} auto quality`,
                    k: encrypt(JSON.stringify({id:format.format_id,ext:format.ext}))
                };
            });
            client.setex(vid, 3600, JSON.stringify(data)); // Cache for 1 hour


            // Send the response
            res.json(response);
        });
    });
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

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});