import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import cloudinary from '../lib/cloudinary'

const router = Router()

// Use memory storage for Cloudinary uploads (or temp file for local fallback)
const useCloudinary = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY)

// Local storage config (fallback for development without Cloudinary)
const uploadsDir = path.join(__dirname, '../../uploads')
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true })
}

const localStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const subfolder = req.body.folder || req.query.folder || 'general'
        const destDir = path.join(uploadsDir, subfolder)
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true })
        }
        cb(null, destDir)
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now()
        const ext = path.extname(file.originalname)
        const baseName = path.basename(file.originalname, ext)
            .replace(/[^a-zA-Z0-9_-]/g, '_')
        cb(null, `${timestamp}-${baseName}${ext}`)
    }
})

// Memory storage for Cloudinary
const memoryStorage = multer.memoryStorage()

// File filter - allow common document types
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const allowedTypes = [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/gif',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/csv'
    ]

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true)
    } else {
        cb(new Error(`File type ${file.mimetype} not allowed`))
    }
}

const upload = multer({
    storage: useCloudinary ? memoryStorage : localStorage,
    fileFilter,
    limits: {
        fileSize: 25 * 1024 * 1024 // 25MB max (matching Gmail limit)
    }
})

// POST /api/files/upload - Upload a single file
router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' })
        }

        const folder = req.body.folder || 'general'

        if (useCloudinary) {
            // Upload to Cloudinary
            const result = await new Promise<any>((resolve, reject) => {
                const safeName = req.file!.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
                const isPdf = req.file!.mimetype === 'application/pdf' || safeName.toLowerCase().endsWith('.pdf');

                // For PDFs, we use 'raw' to avoid "Restricted media types" (401) issues.
                // Additionally, we MUST change the extension/suffix because the account blocks ".pdf" 
                // specifically, regardless of resource_type.
                const resType: 'image' | 'auto' | 'raw' = isPdf ? 'raw' : 'auto';
                const publicId = isPdf
                    ? safeName + '_secure' // Appending suffix avoids ".pdf" strict block
                    : safeName.replace(/\.[^/.]+$/, "");

                const uploadStream = cloudinary.uploader.upload_stream(
                    {
                        folder: `conta-residencial/${folder}`,
                        resource_type: resType,
                        public_id: publicId
                    },
                    (error: Error | null, result: any) => {
                        if (error) reject(error)
                        else resolve(result)
                    }
                )
                uploadStream.end(req.file!.buffer)
            })

            res.json({
                success: true,
                url: result.secure_url,
                publicId: result.public_id,
                filename: req.file.originalname,
                size: req.file.size,
                mimetype: req.file.mimetype
            })
        } else {
            // Local storage fallback
            const relativePath = path.relative(uploadsDir, req.file.path).replace(/\\/g, '/')
            const fileUrl = `/uploads/${relativePath}`

            res.json({
                success: true,
                url: fileUrl,
                filename: req.file.filename,
                originalName: req.file.originalname,
                size: req.file.size,
                mimetype: req.file.mimetype
            })
        }
    } catch (error) {
        console.error('Error uploading file:', error)
        res.status(500).json({ error: 'Error uploading file' })
    }
})

// DELETE /api/files/:folder/:filename - Delete a file
router.delete('/:folder/:filename', async (req, res) => {
    try {
        const { folder, filename } = req.params

        if (useCloudinary) {
            // For Cloudinary, we need the public_id
            const publicId = `conta-residencial/${folder}/${filename.replace(/\.[^/.]+$/, '')}`
            await cloudinary.uploader.destroy(publicId)
            res.json({ success: true, message: 'File deleted from Cloudinary' })
        } else {
            // Local file deletion
            const filePath = path.join(uploadsDir, folder, filename)
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath)
                res.json({ success: true, message: 'File deleted' })
            } else {
                res.status(404).json({ error: 'File not found' })
            }
        }
    } catch (error) {
        console.error('Error deleting file:', error)
        res.status(500).json({ error: 'Error deleting file' })
    }
})

export default router
