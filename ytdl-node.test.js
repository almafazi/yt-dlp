const redis = require('redis');

const client = redis.createClient({
    host: '89.163.135.51',
    port: 6379,
    password: '!Rahman214'
});

client.on('connect', function() {
    console.log('Connected to Redis');
});

client.on('error', function (err) {
    console.log('Redis error: ' + err);
});