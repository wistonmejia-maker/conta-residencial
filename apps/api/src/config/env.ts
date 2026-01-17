import dotenv from 'dotenv';
dotenv.config();

export const config = {
    PORT: process.env.PORT || 3002,
    DATABASE_URL: process.env.DATABASE_URL || '',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
    GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || '',
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
};

console.log('--- API Config Check ---');
console.log('PORT:', config.PORT);
console.log('DATABASE_URL:', config.DATABASE_URL ? 'PRESENT' : 'MISSING');
console.log('GOOGLE_CLIENT_ID:', config.GOOGLE_CLIENT_ID ? 'PRESENT' : 'MISSING');
console.log('GOOGLE_CLIENT_SECRET:', config.GOOGLE_CLIENT_SECRET ? 'PRESENT' : 'MISSING');
console.log('GOOGLE_REDIRECT_URI:', config.GOOGLE_REDIRECT_URI);
console.log('------------------------');
