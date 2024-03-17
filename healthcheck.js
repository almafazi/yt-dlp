const express = require('express');
const os = require('os');
const disk = require('diskusage');
const osUtils = require('os-utils');

const app = express();
const port = 3044;

// Middleware for CORS
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

// Health endpoint
app.get('/health', async (req, res) => {
    try {
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const usedMemory = totalMemory - freeMemory;
        const memoryUsagePercent = (usedMemory / totalMemory) * 100;

        const cpuUsagePromise = new Promise((resolve, reject) => {
            osUtils.cpuUsage((cpuUsage) => {
                resolve(cpuUsage);
            });
        });

        const diskUsagePromise = new Promise((resolve, reject) => {
            disk.check('/', (err, info) => {
                if (err) reject(err);
                resolve(info);
            });
        });

        const [cpuUsage, diskUsage] = await Promise.all([cpuUsagePromise, diskUsagePromise]);

        // Define your thresholds
        const cpuThreshold = 75; // 80% usage
        const memoryThreshold = 75; // 80% usage
        const diskThreshold = 75; // 80% usage

        // Determine health status based on thresholds
        let healthStatus = 'healthy';
        if (cpuUsage * 100 > cpuThreshold) {
            healthStatus = 'unhealthy (high CPU usage)';
        } else if (memoryUsagePercent > memoryThreshold) {
            healthStatus = 'unhealthy (high memory usage)';
        } else if ((diskUsage.total - diskUsage.free) / diskUsage.total > diskThreshold / 100) {
            healthStatus = 'unhealthy (low disk space)';
        }

        res.json({
            cpuUsage: cpuUsage * 100, // Convert to percentage
            memoryUsage: memoryUsagePercent,
            diskUsage: (diskUsage.total - diskUsage.free) / 1024 / 1024, // Convert to MB
            totalDiskSpace: diskUsage.total / 1024 / 1024, // Convert to MB
            healthStatus: healthStatus
        });
    } catch (error) {
        console.error("Error:", error);
        res.status(500).send("Internal Server Error");
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});