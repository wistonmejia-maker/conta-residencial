// list-models.ts
const https = require('https');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const key = process.env.GEMINI_API_KEY;

if (!key) {
    console.error('No API Key found');
    process.exit(1);
}

const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;

https.get(url, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            if (json.error) {
                console.error('API Error:', json.error);
            } else if (json.models) {
                console.log('Available Models:');
                json.models.forEach((m) => {
                    console.log(`- ${m.name}`);
                });
            } else {
                console.log('Unexpected response:', json);
            }
        } catch (e) {
            console.error('Error parsing JSON:', e);
            console.log('Raw data:', data);
        }
    });

}).on('error', (err) => {
    console.error('Network Error:', err);
});
