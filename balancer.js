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

async function searchFileOnServers(id, servers) {
    // Create an array of promises that resolve when the file is found
    const fileExistPromises = servers.map(server =>
        axios.get(`${server.url}/filecheckcdn/${id}`)
            .then(response => {
                if (response.status === 200) {
                    return { server: server.url, mp3Path: response.data.mp3Path, exists: true };
                }
                throw new Error('Not found on this server');
            })
            .catch(error => ({ server: server.url, mp3Path: null, exists: false }))
    );

    while (fileExistPromises.length > 0) {
        // Wait for the fastest promise to resolve
        const result = await Promise.race(fileExistPromises);

        // If the file was found, return the result
        if (result.exists) {
            return result;
        }

        // If the file was not found, remove the promise from the array
        fileExistPromises.splice(fileExistPromises.findIndex(p => p === result), 1);
    }

    // If the file was not found on any server, continue the proxy
    return null;
}

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

    const result = await searchFileOnServers(id, servers);

    if (result) {
        res.setHeader('Access-Control-Expose-Headers', 'X-Server-URL');
        res.setHeader('X-Server-URL', result.server);
        res.json(result);
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