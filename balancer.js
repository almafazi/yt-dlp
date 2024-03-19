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
    { url: process.env.URL_1, weight: 53 },
    { url: process.env.URL_2, weight: 47 }
];

app.use(cors());

async function healthCheckServer(server) {
    return new Promise(resolve => {
        client.get(`${server.url}/health`, async (err, result) => {
            if (err || result === null) {
                try {
                    const response = await axios.get(`${server.url}/health`);
                    const isHealthy = response.data.healthStatus === 'healthy';
                    client.set(`${server.url}/health`, isHealthy ? 'healthy' : 'unhealthy', 'EX', 60);
                    resolve(isHealthy);
                } catch (error) {
                    resolve(false);
                }
            } else {
                resolve(result === 'healthy');
            }
        });
    });
}

async function searchFileOnServers(id, servers) {
    let fileFound = false;

    // Send requests to both servers simultaneously
    const promises = servers.map(server => new Promise((resolve, reject) => {
        axios.get(`${server.url}/filecheckcdn/${id}`)
            .then(response => {
                if (response.status === 200) {
                    // If file found on this server, set fileFound flag and return result
                    fileFound = true;
                    resolve({
                        server: server.url,
                        mp3Path: response.data.mp3Path,
                        exists: true,
                        fromFirstCheck: true
                    });
                } else {
                    reject(new Error(`File not found on ${server.url}`));
                }
            })
            .catch(error => {
                resolve(null); // Resolve with null for failed requests
            });
    }));

    // Wait for all promises to resolve or reject
    const results = await Promise.all(promises);

    // Find the first successful response and stop further requests
    for (const result of results) {
        if (result && result.exists) {
            return result;
        }
    }

    // If file not found on any server, return false
    return false;
}


app.use(async (req, res, next) => {
    const { youtubeUrl } = req.body;
    if (!youtubeUrl) {
        res.status(400).json({ message: 'youtubeUrl is required' });
        return;
    }

    const youtubeId = extractYoutubeId(youtubeUrl);

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
        const healthCheck = await healthCheckServer(server)
        if (!healthCheck) {
            server = null;  // If the server from Redis is not healthy, set server to null
        }
    }

    if (!server) {
        // If the server from Redis is not healthy or doesn't exist, select a new server
        const totalWeight = servers.reduce((total, server) => total + server.weight, 0);
        let weightSum = 0;
        const random = Math.floor(Math.random() * totalWeight);

        for (const s of servers) {
            weightSum += s.weight;
            if (random < weightSum) {
                const healthCheck = await healthCheckServer(s);
                if (healthCheck) {
                    server = s;
                    break;
                }
            }
        }

        if (!server) {
            // If no server is healthy, reject the request
            res.status(503).send({'error': 'Server Full'});
            return;
        }

        client.set('server', server.url, 'EX', 60);  // Cache the new server selection for 60 seconds
    }
    
    proxy.on('proxyRes', function (proxyRes, req, res) {
        res.setHeader('X-Server-URL', server.url);
    });
    proxy.web(req, res, { target: server.url, changeOrigin: true});
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