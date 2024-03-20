const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const Queue = require('bull');
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const unlink = promisify(fs.unlink);
const rmdir = promisify(fs.rmdir);
require('dotenv').config()

cron.schedule('*/5 * * * * *', () => {
    const directory = `${__dirname}/converted`; 

    const queue = new Queue(process.env.QUEUE_NAME, {
        redis: {
            host: process.env.QUEUE_HOST,
            port: 6379,
            password: process.env.QUEUE_PASSWORD
        },
    });
    console.log('test');

    checkDiskSpace('/').then( async (diskSpace) => {
        const freeSpaceInPercent = Math.round((diskSpace.free / diskSpace.size) * 100);
        console.log({freeSpaceInPercent});
        if(freeSpaceInPercent < 35) {
            const files = await readdir(directory);
            const fileStats = await Promise.all(files.map(file => stat(path.join(directory, file))));
            const fileStatMap = files.reduce((acc, file, index) => ({ ...acc, [file]: fileStats[index] }), {});
            const sortedFiles = files.sort((a, b) => fileStatMap[a].birthtime - fileStatMap[b].birthtime);
            const filesToRemove = sortedFiles.slice(0, Math.round(sortedFiles.length * 0.35));

            await Promise.all(filesToRemove.map(async file => {
                const filePath = path.join(directory, file);
                console.log({free: freeSpaceInPercent, deleted: filePath})
                if (fileStatMap[file].isDirectory()) {
                    await rmdir(filePath, { recursive: true });
                } else {
                    await unlink(filePath);
                }
                await queue.removeJobs(file);
            }));
        }
    })
});




