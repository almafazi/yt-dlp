const express = require('express');
const httpProxy = require('http-proxy');
const axios = require('axios');
const redis = require('ioredis');
const cors = require('cors');

require('dotenv').config()
const app = express();
const proxy = httpProxy.createProxyServer();
const client = redis.createClient({
    host: 'localhost',
    port: 6379,
    password: process.env.REDIS_PASSWORD
});

const servers = [
    { url: process.env.URL_1, weight: 60 },
    { url: process.env.URL_2, weight: 20 },
    { url: process.env.URL_3, weight: 20 },
];

app.use(cors());


app.use(async (req, res, next) => {
    let server;
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

    if (server.url !== process.env.URL_1) {
        try {
            const healthCheckResponse = await axios.get(`${server.url}/health`);
            if (healthCheckResponse.data.healthStatus !== 'healthy') {
                server = servers[0];
            }
        } catch (error) {
            server = servers[0];
        }
    }

    proxy.on('proxyRes', function (proxyRes, req, res) {
        res.setHeader('X-Server-URL', server.url);
    });
    proxy.web(req, res, { target: server.url, rejectUnauthorized: false,   changeOrigin: true,
    });
});

app.listen(3033);