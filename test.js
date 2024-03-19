const axios = require('axios');

setInterval(async () => {
    try {
        const response = await axios.get('http://127.0.0.1:3007/check/eVTXPUF4Oz4');
        console.log(response.data);
    } catch (error) {
        console.error(error);
    }
}, 1000);