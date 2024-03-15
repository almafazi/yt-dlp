const { exec } = require('child_process');

const url = 'asdad'; // Replace VIDEO_ID with the actual video ID

const command = `./yt-dlp.sh --quiet --skip-download --dump-json ${url}`;

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