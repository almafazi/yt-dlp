const { exec } = require('child_process');

exec('ls -tr ./converted', (error, stdout, stderr) => {
  if (error) {
    console.error(`exec error: ${error}`);
    return;
  }

  const files = stdout.split('\n');
  files.forEach((file) => {
    if (file) {
      console.log(file);
      // Process the file here...
    }
  });
});