import { exec } from 'child_process';
import uWS from 'uWebSockets.js';
import ejs from 'ejs';
import querystring from 'querystring';

const scriptPath = 'yt_dlp/__main__.py';

const app = uWS.App();

app.options('/*', (res, req) => {
  res.writeHeader('Access-Control-Allow-Origin', '*');
  res.writeHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.writeHeader('Access-Control-Allow-Headers', '*');
  res.end();
});

function formatDuration(seconds) {
    const minutes = Math.floor(seconds / 60);
    seconds %= 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

app.get('/fetch', (res, req) => {
  res.writeHeader('Access-Control-Allow-Origin', '*');
  res.writeHeader('Access-Control-Allow-Methods', 'GET');

  res.onAborted(() => {
    res.writeStatus('500 Internal Server Error').end('ERROR');
  });
  const query = req.getQuery();
  const params = querystring.parse(query);
  const url = params.url;
  if (!url) {
    res.cork(() => {
      res.writeStatus('400 Bad Request').end('Missing URL parameter');
    });
    return;
  }

  exec(`python3 -Werror -Xdev ${scriptPath} -J ${url}`, (error, stdout, stderr) => {
    if (error) {
        res.cork(() => {
          res.writeStatus('500 Internal Server Error').end('Failed to fetch video data');
        });
        return;
    }
    
    const videoData = JSON.parse(stdout);

    console.log(videoData)

    ejs.renderFile('views/savefrom.ejs', { videoData, formatDuration }, (err, html) => {
        if (err) {
          res.cork(() => {
            res.writeStatus('500 Internal Server Error').end('Failed to fetch video data');
          });            
          return;
        }

        res.cork(() => {
          res.writeHeader('Content-Type', 'application/json');
          res.writeStatus('200 OK').end(JSON.stringify({ html }));
        });
    });
  });

});

app.listen(3333, (token) => {
  if (token) {
    console.log('uWebSockets server listening on port 3333');
  } else {
    console.log('Failed to listen on port 3333');
  }
});