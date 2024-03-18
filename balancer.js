const express = require('express');
const axios = require('axios');
const redis = require('ioredis');
const cors = require('cors');
const extractYoutubeId = require('youtube-video-id').default;
const proxy = require('express-http-proxy');

require('dotenv').config()
const client = redis.createClient({
    host: 'localhost',
    port: 6379,
    password: process.env.REDIS_PASSWORD
});

const app = express();
app.use(express.json());


const servers = [
    { url: process.env.URL_1, weight: 60 },
    { url: process.env.URL_2, weight: 40 }
];

app.use(cors());

app.use(async (req, res, next) => {
    const { youtubeUrl } = req.body;
    const youtubeId = extractYoutubeId(youtubeUrl);
    if (!youtubeUrl) {
        res.status(400).json({ message: 'youtubeUrl is required' });
        return;
    }
    if (!validateYouTubeUrl(youtubeUrl)) {
        res.status(400).json({ message: 'Invalid youtubeUrl' });
        return;
    }

    const id = youtubeId;
    let server;

    // Check if the file exists on any server
    const fileExistPromises = servers.map(s => 
        axios.get(`${s.url}/filecheckcdn/${id}`)
            .then(response => ({ server: s, filePath: response.data.filePath, isFileExists: true }))
            .catch(() => ({ server: s, filePath: null, isFileExists: false }))
    );
    const result = await Promise.race(fileExistPromises);

    if (result.isFileExists) {
        res.setHeader('Access-Control-Expose-Headers', 'X-Server-URL');
        res.setHeader('X-Server-URL', result.server.url);
        res.json({ exists: true, isFileExists: result.isFileExists, filePath: result.filePath });

        return;
    }

    // If the file does not exist on any server, run the load balancer
    const serverFromCache = await new Promise((resolve) => {
        client.get('server', (err, reply) => {
            resolve(reply);
        });
    });

    if (serverFromCache) {
        server = servers.find(s => s.url === serverFromCache);
    } else {
        const totalWeight = servers.reduce((total, server) => total + server.weight, 0);
        const random = Math.floor(Math.random() * totalWeight);

        let weightSum = 0;
        for (const s of servers) {
            weightSum += s.weight;
            if (random < weightSum) {
                server = s;
                break;
            }
        }

        client.set('server', server.url, 'EX', 60);  // Cache the server selection for 60 seconds
    }

    // Perform a health check on the selected server
    const healthCheckPromises = servers.map(s => axios.get(`${s.url}/health`).then(() => s).catch(() => null));
    const healthyServer = await Promise.race(healthCheckPromises);
    if (!healthyServer) {
        // If no server is healthy, reject the request
        res.status(503).send('Server Full');
        return;
    }

    proxy(healthyServer.url, {
        proxyErrorHandler: function(err, res, next) {
            console.error('Failed to proxy:', err);
            next(err);
        },
        proxyReqOptDecorator: function(proxyReqOpts, srcReq) {
            proxyReqOpts.headers['X-Server-URL'] = healthyServer.url;
            return proxyReqOpts;
        }
    })(req, res);

    // res.setHeader('X-Server-URL', healthyServer.url);
    res.setHeader('Access-Control-Expose-Headers', 'X-Server-URL');

});

function validateYouTubeUrl(urlToParse) {
    if (urlToParse) {
        var regExp = /^(?:https?:\/\/)?(?:m\.|www\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))((\w|-){11})(?:\S+)?$/;
        if (urlToParse.match(regExp)) {
            return true;
        }
    }
    return false;
}


app.listen(3033);