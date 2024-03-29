const express = require('express');
const { spawn } = require('child_process');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const app = express();

const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 2, // 2 requests per minute
});

app.use(limiter);
app.get('/download', (req, res) => {
    const link = req.query.link;
    const author = req.query.author;
    const musiclink = req.query.musiclink;
    const imglink = req.query.imglink;

    if (!link && !musiclink && !imglink) {
        res.status(400).send({ error: 'url parameter is required' });
        return;
    }
    if (!author) {
        res.status(400).send({ error: 'url parameter is required' });
        return;
    }
    const dlink = link ? link : (musiclink ? musiclink : imglink);
    const now = new Date(); 
    
    const formattedDate = `${now.getDate()}-${now.getMonth() + 1}-${now.getFullYear()} ${now.getHours()}_${now.getMinutes()}`;

    if(link) {
        const filename = `${process.env.FILENAME_PREFIX}${author.trim()} ${formattedDate}.mp4`;
        const url = decrypt(dlink);
    
        const proxy = '--proxy http://hwbknjxk-rotate:wcpjh6lq5loy@p.webshare.io:80';
        const ytDlp = spawn('./yt-dlp.sh', ['-f', 'best', '-o', '-', url]);
    
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Transfer-Encoding', 'Binary');
        res.setHeader('Content-Disposition', 'attachment; filename='+filename);
        ytDlp.stdout.pipe(res);
        ytDlp.stderr.on('data', (data) => {
            console.error(`stderr: ${data}`);
        });
    } else if(musiclink) {
        const filename = `${process.env.FILENAME_PREFIX}${author.trim()} ${formattedDate}.mp3`;
        const url = decrypt(musiclink);
    
        const ytDlp = spawn('./yt-dlp.sh', ['-f', 'mp3', '-o', '-', url]);
    
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Transfer-Encoding', 'Binary');
        res.setHeader('Content-Disposition', 'attachment; filename='+filename);
        ytDlp.stdout.pipe(res);
        ytDlp.stderr.on('data', (data) => {
            console.error(`stderr: ${data}`);
        });
    } else if(imglink) {
        const filename = `${process.env.FILENAME_PREFIX}${author.trim()} ${formattedDate}.jpeg`;
        const url = decrypt(imglink);
        console.log(imglink)
    
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Content-Transfer-Encoding', 'Binary');
        res.setHeader('Content-Disposition', 'attachment; filename='+filename);
        res.download(url);
    } else {
        return res.status(500).send({ error: 'Internal server error' });
    }

    
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