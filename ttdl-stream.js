const express = require('express');
const { spawn } = require('child_process');
const crypto = require('crypto');

const app = express();

app.get('/download', (req, res) => {
    const dlink = req.query.link;
    const author = req.query.author;
    if (!dlink || !author) {
        res.status(400).send({ error: 'url parameter is required' });
        return;
    }

    const now = new Date(); 
    
    const formattedDate = `${now.getDate()}-${now.getMonth() + 1}-${now.getFullYear()} ${now.getHours()}_${now.getMinutes()}`;

    const filename = `${author.trim()} ${formattedDate} Snaptik.mp4`;
    const url = decrypt(dlink);

    const proxy = '--proxy http://hwbknjxk-rotate:wcpjh6lq5loy@p.webshare.io:80';
    const ytDlp = spawn('./yt-dlp.sh', ['-f', 'best', '-o', '-', url]);

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', 'attachment; filename='+filename);

    ytDlp.stdout.pipe(res);
    ytDlp.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
    });
});

function decrypt(text) {
    const key = crypto.scryptSync('encryption key', 'salt', 32);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.alloc(16));
    let decrypted = decipher.update(text, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

app.listen(3044, () => {
    console.log('Server started on port 3044');
});