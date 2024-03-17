const express = require('express');
const axios = require('axios');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
const servers = ['https://node1.canehill.info/api-dl', 'https://dl1.canehill.info/api-dl', 'https://dl2.canehill.info/api-dl'];
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

    try {
        // Check if any server already has the file
        const checkPromises = servers.map(server => axios.get(`${server}/check-folder/${fileId}`));
        const responses = await Promise.all(checkPromises);

        // Find the first server that has the file
        const serverWithFile = responses.find(response => response.data.exists);

        if (serverWithFile) {
            // File exists on a server, apply conversion process on that server
            const serverName = serverWithFile.config.url.split('/')[2];
            const serverNameWithProtocol = `${serverName.startsWith('http') ? '' : 'http://'}${serverName}`;
            res.json({ server: serverNameWithProtocol, exists: true, ...serverWithFile.data});
        } else {
            // No server has the file, randomly choose a server
            const randomServer = servers[Math.floor(Math.random() * servers.length)];
            res.json({ server: randomServer, exists: false });
        }
    } catch (error) {
        console.log(error);
        res.status(500).send('Error occurred during conversion process');
    }
});

app.listen(3088, () => {
    console.log('Server is running on port 3088');
});