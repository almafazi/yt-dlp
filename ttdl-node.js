const { exec } = require('child_process');

const url = 'https://www.tiktok.com/@topantambora/video/7321675178298117382'; // Replace VIDEO_ID with the actual video ID

const command = `./yt-dlp.sh --quiet --skip-download --dump-json --force-ipv4 ${url}`;

exec(command, (error, stdout, stderr) => {
    if (error) {
        console.error(`Error: ${error.message}`);
        return;
    }
    if (stderr) {
        console.error(`stderr: ${stderr}`);
        return;
    }
    
    // Process the JSON output
    const videoInfo = JSON.parse(stdout);
    console.log(videoInfo);
});