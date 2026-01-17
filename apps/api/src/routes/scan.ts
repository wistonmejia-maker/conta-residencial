import { Router } from 'express';
import prisma from '../lib/prisma';
import { fetchNewEmails, getAttachment, markAsRead, fetchRecentEmails } from '../services/gmail.service';
import { classifyAndExtractDocument } from '../services/ai.service';
import cloudinary from '../lib/cloudinary';
import path from 'path';
import fs from 'fs';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// GET /gmail/preview?unitId=...
router.get('/gmail/preview', async (req, res) => {
    const { unitId } = req.query;
    if (!unitId) return res.status(400).send({ error: 'Unit ID is required' });

    try {
        const emails = await fetchRecentEmails(unitId as string);
        res.json({ success: true, emails });
    } catch (error) {
        console.error('Error fetching Gmail preview:', error);
        res.status(500).json({ error: 'Error fetching preview' });
    }
});

// GET /api/scan/status/:jobId
router.get('/scan-status/:jobId', async (req, res) => {
    const { jobId } = req.params;
    try {
        const job = await prisma.scanningJob.findUnique({ where: { id: jobId } });
        if (!job) return res.status(404).json({ error: 'Job not found' });
        res.json(job);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching job status' });
    }
});

// Helper to upload buffer (Cloudinary or Local)
async function uploadBuffer(buffer: Buffer, filename: string, folder: string = 'general'): Promise<string> {
    const useCloudinary = !!(
        process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_CLOUD_NAME !== 'your_cloud_name' &&
        process.env.CLOUDINARY_API_KEY
    );

    if (useCloudinary) {
        return new Promise((resolve, reject) => {
            // Sanitize filename for Cloudinary public_id (remove special chars/spaces)
            const safeName = filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');

            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: `conta-residencial/${folder}`,
                    resource_type: 'auto',
                    public_id: safeName.replace(/\.[^/.]+$/, "") // Remove extension for public_id
                },
                (error: any, result: any) => {
                    if (error) reject(error);
                    else resolve(result!.secure_url);
                }
            );
            uploadStream.end(buffer);
        });
    } else {
        const uploadsDir = path.resolve(process.cwd(), 'uploads');
        const destDir = path.join(uploadsDir, folder);
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

        const timestamp = Date.now();
        const safeName = filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const finalName = `${timestamp}-${safeName}`;
        const filePath = path.join(destDir, finalName);

        fs.writeFileSync(filePath, buffer);

        // In production (Railway), allow using the public domain if API_URL is not set
        let baseUrl = process.env.API_URL;
        if (!baseUrl) {
            // Fallback to current domain if possible, or localhost
            // If we are in Railway, we might use the RAICWAY_PUBLIC_DOMAIN or similar, 
            // but 'GOOGLE_REDIRECT_URI' usually contains the public base
            if (process.env.GOOGLE_REDIRECT_URI) {
                baseUrl = new URL(process.env.GOOGLE_REDIRECT_URI).origin;
            } else {
                baseUrl = 'http://localhost:3002';
            }
        }

        return `${baseUrl}/uploads/${folder}/${finalName}`;
    }
}

const SCAN_LOG = path.join(process.cwd(), 'scan_debug.log');
function logScan(msg: string) {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    try {
        fs.appendFileSync(SCAN_LOG, line);
    } catch (e) { }
    console.log(msg);
}

// Internal function to run the scan in background
async function runBackgroundScan(jobId: string, unitId: string) {
    const results: any[] = [];
    let processedCount = 0;

    try {
        const unit = await prisma.unit.findUnique({ where: { id: unitId } });
        if (!unit) throw new Error('Unit not found');

        await prisma.scanningJob.update({
            where: { id: jobId },
            data: { status: 'PROCESSING', progress: 5 }
        });

        const emails = await fetchNewEmails(unitId);

        await prisma.scanningJob.update({
            where: { id: jobId },
            data: { totalItems: emails.length, progress: 10 }
        });

        if (emails.length === 0) {
            await prisma.scanningJob.update({
                where: { id: jobId },
                data: { status: 'COMPLETED', progress: 100, completedAt: new Date() }
            });
            return;
        }

        for (let i = 0; i < emails.length; i++) {
            const email = emails[i];
            let emailProcessed = false;

            for (const att of email.attachments) {
                let buffer: Buffer | null = null;
                let mimeType = att.mimeType;
                let filename = att.filename;

                try {
                    const isPdf = mimeType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf');
                    const isImage = mimeType.startsWith('image/');
                    const isZip = filename.toLowerCase().endsWith('.zip');

                    if (isPdf || isImage) {
                        buffer = await getAttachment(unitId, email.id, att.attachmentId);
                    } else if (isZip) {
                        const zipBuffer = await getAttachment(unitId, email.id, att.attachmentId);
                        const AdmZip = require('adm-zip');
                        const zip = new AdmZip(zipBuffer);
                        const pdfEntry = zip.getEntries().find((e: any) => e.entryName.toLowerCase().endsWith('.pdf'));
                        if (pdfEntry) {
                            buffer = pdfEntry.getData();
                            mimeType = 'application/pdf';
                            filename = pdfEntry.entryName;
                        }
                    }

                    if (buffer) {
                        await new Promise(r => setTimeout(r, 4000)); // Rate limit
                        const analysis = await classifyAndExtractDocument(buffer, mimeType);

                        if (analysis.type === 'INVOICE' && analysis.data) {
                            const { nit, providerName, clientNit, invoiceNumber, totalAmount, date, concept } = analysis.data;

                            // Validar NIT (leniente)
                            const cleanUnitNit = unit.taxId.replace(/[^0-9]/g, '').substring(0, 9);
                            const cleanInvoiceClientNit = (clientNit || '').replace(/[^0-9]/g, '').substring(0, 9);

                            if (cleanInvoiceClientNit && cleanUnitNit !== cleanInvoiceClientNit) {
                                logScan(`  [!] NIT mismatch: ${cleanInvoiceClientNit} vs ${cleanUnitNit}`);
                                continue;
                            }

                            const fileUrl = await uploadBuffer(buffer, filename, `units/${unitId}/invoices`);

                            let provider = await prisma.provider.findUnique({ where: { nit: nit! } });
                            if (!provider) {
                                provider = await prisma.provider.create({
                                    data: { name: providerName!, nit: nit!, taxType: 'NIT', dv: '0', email: email.from }
                                });
                            }

                            const existing = await prisma.invoice.findFirst({
                                where: { providerId: provider.id, invoiceNumber: invoiceNumber || 'SIN-REF' }
                            });

                            if (!existing) {
                                const inv = await prisma.invoice.create({
                                    data: {
                                        unitId, providerId: provider.id, invoiceNumber: invoiceNumber || 'SIN-REF',
                                        invoiceDate: date ? new Date(date) : new Date(),
                                        totalAmount, subtotal: totalAmount, status: 'DRAFT',
                                        description: `Importado: ${email.subject}`, pdfUrl: fileUrl, fileUrl
                                    }
                                });
                                results.push({ status: 'created', type: 'invoice', id: inv.id, file: filename });
                                emailProcessed = true;
                            }
                        } else if (analysis.type === 'PAYMENT_RECEIPT' && analysis.data) {
                            const { totalAmount, date, transactionRef, bankName } = analysis.data;
                            if (transactionRef) {
                                const existing = await prisma.payment.findFirst({
                                    where: { unitId, transactionRef, amountPaid: totalAmount }
                                });
                                if (!existing) {
                                    const fileUrl = await uploadBuffer(buffer, filename, `units/${unitId}/payments`);
                                    const pay = await prisma.payment.create({
                                        data: {
                                            unitId, paymentDate: date ? new Date(date) : new Date(),
                                            amountPaid: totalAmount, netValue: totalAmount, sourceType: 'BANCO',
                                            bankPaymentMethod: bankName || 'GMAIL', transactionRef, status: 'DRAFT',
                                            supportFileUrl: fileUrl
                                        }
                                    });
                                    results.push({ status: 'created', type: 'payment', id: pay.id, file: filename });
                                    emailProcessed = true;
                                }
                            }
                        }
                    }
                } catch (err: any) {
                    logScan(`Error processing attachment: ${err.message}`);
                    if (err.message.includes('429')) await new Promise(r => setTimeout(r, 10000));
                }
            }

            if (emailProcessed) await markAsRead(unitId, email.id);

            processedCount++;
            const progress = Math.round(10 + (processedCount / emails.length) * 85);
            await prisma.scanningJob.update({
                where: { id: jobId },
                data: { progress, processedCount, results: results as any }
            });
        }

        await prisma.scanningJob.update({
            where: { id: jobId },
            data: { status: 'COMPLETED', progress: 100, completedAt: new Date(), results: results as any }
        });

    } catch (error: any) {
        logScan(`JOB FAILED: ${error.message}`);
        await prisma.scanningJob.update({
            where: { id: jobId },
            data: { status: 'FAILED', error: error.message }
        });
    }
}

// POST /scan-gmail?unitId=...
router.post('/scan-gmail', async (req, res) => {
    const { unitId } = req.query;
    if (!unitId) return res.status(400).send({ error: 'Unit ID is required' });

    try {
        const job = await prisma.scanningJob.create({
            data: { unitId: unitId as string, status: 'PENDING' }
        });

        // Trigger background process
        runBackgroundScan(job.id, unitId as string);

        res.json({ success: true, jobId: job.id });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/analyze', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const analysis = await classifyAndExtractDocument(req.file.buffer, req.file.mimetype);
        res.json(analysis);
    } catch (error) {
        res.status(500).json({ error: 'Error analyzing document' });
    }
});

export default router;
