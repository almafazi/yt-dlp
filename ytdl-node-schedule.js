const cron = require('node-cron');
const findRemoveSync = require('find-remove');
const Queue = require('bull');

cron.schedule('*/10 * * * *', () => {
    const directory = `${__dirname}/converted`; 

    const queue = new Queue('yt-dlp-conversion', {
        redis: {
            host: 'localhost',
            port: 6379,
            // password: '!Rahman214'
        },
    });
    const result = findRemoveSync(directory, { age: { hours: 3 }, dir: '*' });
    if(result) {
        Object.keys(result).forEach((file) => {
            const fileName = file.split('/').pop();
            queue.removeJobs(fileName).then(function () {
                console.log('done removing jobs');
            });
        });
    }
});