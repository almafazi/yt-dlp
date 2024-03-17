const express = require('express');
const axios = require('axios');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();

const servers_forhealth = ['https://dl1.canehill.info/api-dl', 'https://dl2.canehill.info/api-dl'];
const health = ['https://node1.canehill.info/api-dl'];

// const servers_forhealth = ['http://localhost:3007'];
// const health = ['http://localhost:3007'];

app.use(cors());
// const limiter = rateLimit({
//     windowMs: 60 * 1000, // 1 minute
//     max: 4, // Maximum 2 requests per minute
//     handler: function(req, res) {
//         res.status(429).json({ message: 'You did this action too quickly, try again later.' });
//     }
// });

app.get('/check', async (req, res) => {
    const fileId = req.query.fileId;

    let endpoint_url = health;

    try {
        const healthCheckPromises = servers_forhealth.map(server => axios.get(`${server}/health`).catch(error => ({ error })));
        const healthResponses = await Promise.all(healthCheckPromises);
        const serverWithHealth = healthResponses.find(response => !response.error && response.data.healthStatus === 'healthy');
        const serverHealth = serverWithHealth ? serverWithHealth.config.url.split('/')[2] : null;
        if(serverHealth){
            endpoint_url = `${serverHealth.startsWith('http') ? '' : 'http://'}${serverHealth}`;
        }
    } catch (error) {
        console.log(error);
        res.status(500).send('Error occurred during health check process');
    }

    try {
        
        const fileCheckResponse = await axios.get(`${endpoint_url}/check-folder/${fileId}`);
        
        const fileExists = fileCheckResponse.data.exists;

        if (fileExists) {
            res.json({ server: endpoint_url, exists: true, ...serverWithFile.data});
        } else {
            res.json({ server: endpoint_url, exists: false });
        }
    } catch (error) {
        console.log(error);
        res.status(500).send('Error occurred during fiile check process');
    }
});

app.listen(3088, () => {
    console.log('Server is running on port 3088');
});