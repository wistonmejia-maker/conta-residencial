// debug-upload.ts
import { config } from 'dotenv';
import path from 'path';
import cloudinary from './src/lib/cloudinary';
import fs from 'fs';

// Force load .env
config({ path: path.join(__dirname, '.env') });

async function uploadBuffer(buffer: Buffer, filename: string, folder: string = 'general'): Promise<string> {
    const useCloudinary = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY);
    console.log(`Using Cloudinary? ${useCloudinary}`);

    if (useCloudinary) {
        console.log('CLOUDINARY_CLOUD_NAME:', process.env.CLOUDINARY_CLOUD_NAME);
        // Don't log full keys for security
        console.log('CLOUDINARY_API_KEY set?', !!process.env.CLOUDINARY_API_KEY);

        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: `conta-residencial/${folder}`,
                    resource_type: 'auto',
                    public_id: filename.replace(/\.[^/.]+$/, "")
                },
                (error: any, result: any) => {
                    if (error) {
                        console.error('Cloudinary Error:', error);
                        reject(error);
                    }
                    else resolve(result!.secure_url);
                }
            );
            uploadStream.end(buffer);
        });
    } else {
        console.log('Using Local Storage');
        const uploadsDir = path.join(__dirname, '../../uploads');
        const destDir = path.join(uploadsDir, folder);
        console.log('Uploads Dirs:', destDir);

        if (!fs.existsSync(destDir)) {
            console.log('Creating directory...');
            fs.mkdirSync(destDir, { recursive: true });
        }

        const timestamp = Date.now();
        const safeName = filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const finalName = `${timestamp}-${safeName}`;
        const filePath = path.join(destDir, finalName);

        console.log('Writing file to:', filePath);
        fs.writeFileSync(filePath, buffer);

        return `/uploads/${folder}/${finalName}`;
    }
}

async function run() {
    console.log('Testing Upload...');
    const dummyBuffer = Buffer.from('Hello World PDF Content');
    try {
        const url = await uploadBuffer(dummyBuffer, 'test-invoice.txt', 'debug-test');
        console.log('Upload Success! URL:', url);
    } catch (err) {
        console.error('Upload Failed:', err);
    }
}

run();
