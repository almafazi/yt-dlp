const express = require('express');
const { spawn } = require('child_process');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const app = express();

const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 2 requests per minute
});

function removeSymbolsAndStrangeLetters(str) {
    // Remove symbols
    const symbolsRemoved = str.replace(/[^\w\s]/gi, '');

    // Remove strange letters
    const strangeLettersRemoved = symbolsRemoved.replace(/[^\x00-\x7F]/g, '');

    return strangeLettersRemoved;
}

app.use(limiter);
app.get('/download', (req, res) => {
    const link = req.query.link;
    const author = req.query.author;
    const musiclink = req.query.musiclink;
    const imglink = req.query.imglink;
    const format_id = req.query.format_id;

    if (!link && !musiclink && !imglink && !format_id) {
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
        const filename = `${process.env.FILENAME_PREFIX}${author.trim()} ${formattedDate}`;
        const url = decrypt(dlink);
    
        const proxy = '--proxy http://hwbknjxk-rotate:wcpjh6lq5loy@p.webshare.io:80';
        const ytDlp = spawn('./yt-dlp.sh', ['-f', format_id, '--extractor-arg', '"tiktok:api_hostname=api16-normal-c-useast1a.tiktokv.com;app_info=INFO"', '-o', '-', url]);
    
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Transfer-Encoding', 'Binary');
        res.setHeader('Content-Disposition', 'attachment; filename='+removeSymbolsAndStrangeLetters(filename)+'.mp4');
        ytDlp.stdout.pipe(res);
        ytDlp.stderr.on('data', (data) => {
            console.error(`stderr: ${data}`);
        });
    } else if(musiclink) {
        const filename = `${process.env.FILENAME_PREFIX}${author.trim()} ${formattedDate}`;
        const url = decrypt(musiclink);
    
        const ytDlp = spawn('./yt-dlp.sh', ['-f', 'mp3', '--extractor-arg', '"tiktok:api_hostname=api16-normal-c-useast1a.tiktokv.com;app_info=INFO"', '-o', '-', url]);
    
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Transfer-Encoding', 'Binary');
        res.setHeader('Content-Disposition', 'attachment; filename='+removeSymbolsAndStrangeLetters(filename)+'.mp3');
        ytDlp.stdout.pipe(res);
        ytDlp.stderr.on('data', (data) => {
            console.error(`stderr: ${data}`);
        });
    } else if(imglink) {
        const filename = `${process.env.FILENAME_PREFIX}${author.trim()} ${formattedDate}`;
        const url = decrypt(imglink);
        console.log(imglink)
    
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Content-Transfer-Encoding', 'Binary');
        res.setHeader('Content-Disposition', 'attachment; filename='+removeSymbolsAndStrangeLetters(filename)+'.jpeg');
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