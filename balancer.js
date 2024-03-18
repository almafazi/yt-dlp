const express = require('express');
const axios = require('axios');
const redis = require('ioredis');
const cors = require('cors');
const extractYoutubeId = require('youtube-video-id').default;
const httpProxy = require('http-proxy');

require('dotenv').config()
const client = redis.createClient({
    host: 'localhost',
    port: 6379,
    password: process.env.REDIS_PASSWORD
});

const app = express();
const proxy = httpProxy.createProxyServer();

// Parse JSON bodies
app.use(express.json());

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true }));

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
    console.log(result);

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
        res.status(503).send('Server Penuh');
        return;
    }

    proxy.on('proxyRes', function (proxyRes, req, res) {
        res.setHeader('X-Server-URL', server.url);
    });
    proxy.web(req, res, { target: healthyServer.url, changeOrigin: true});
    res.setHeader('Access-Control-Expose-Headers', 'X-Server-URL');

});

proxy.on('proxyReq', (proxyReq, req) => {
    if (req.body) {
        const bodyData = JSON.stringify(req.body);
        // incase if content-type is application/x-www-form-urlencoded -> we need to change to application/json
        proxyReq.setHeader('Content-Type','application/json');
        proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
        // stream the content
        proxyReq.write(bodyData);
    }
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