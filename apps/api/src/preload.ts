// This file must be loaded first to ensure environment variables are available
// Use: node -r ./dist/preload.js ./dist/index.js
require('dotenv').config()
console.log('Preload: Environment variables loaded')
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET')
