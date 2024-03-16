const cron = require('node-cron');
const findRemoveSync = require('find-remove');
const Queue = require('bull');

cron.schedule('*/5 * * * *', () => {
    const directory = `${__dirname}/converted`; 

    const queue = new Queue('yt-dlp-conversion', {
        redis: {
            host: 'localhost',
            port: 6379,
            password: '!Rahman214'
        },
    });
    checkDiskSpace('/').then((diskSpace) => {
        const freeSpaceInPercent = Math.round((diskSpace.free / diskSpace.size) * 100);
        if(freeSpaceInPercent < 25) {
            const result = findRemoveSync(directory, { age: { minutes: 30 }, dir: '*' });
            if(result) {
                Object.keys(result).forEach((file) => {
                    const fileName = file.split('/').pop();
                    queue.removeJobs(fileName).then(function () {
                        console.log('done removing jobs');
                    });
                });
            }
        }
    })
});