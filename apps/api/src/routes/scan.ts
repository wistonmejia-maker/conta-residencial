import { Router } from 'express';
import prisma from '../lib/prisma';
import { fetchNewEmails, getAttachment, markAsRead, fetchRecentEmails, ensureLabel, markAsProcessed } from '../services/gmail.service';
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
            // Sanitize filename for Cloudinary public_id
            const safeName = filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
            const isPdf = filename.toLowerCase().endsWith('.pdf');

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
                    // Cloudinary best practice: no extension for 'image', yes for 'raw'
                    public_id: publicId
                },
                (error: any, result: any) => {
                    if (error) {
                        console.error('Cloudinary Upload Error:', error);
                        reject(error);
                    } else resolve(result!.secure_url);
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

        // In production (Railway), ensure we use the public HTTPS domain
        let baseUrl = process.env.API_URL || process.env.PUBLIC_URL;

        if (!baseUrl && process.env.RAILWAY_PUBLIC_DOMAIN) {
            baseUrl = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
        }

        if (!baseUrl) {
            // Fallback for local development
            if (process.env.GOOGLE_REDIRECT_URI) {
                try {
                    baseUrl = new URL(process.env.GOOGLE_REDIRECT_URI).origin;
                } catch (e) { baseUrl = 'http://localhost:3002'; }
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

// Helpers for robust parsing
function parseRobusDate(dateStr: string): Date {
    if (!dateStr) return new Date();
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d;

    // Try common Spanish/Gemini variations if ISO fails
    // (Actual parsing logic can be expanded)
    return new Date();
}

function parseRobustAmount(amt: any): number {
    if (typeof amt === 'number') return amt;
    if (typeof amt === 'string') {
        // Remove $ and , . etc then parse
        const clean = amt.replace(/[^0-9.]/g, '');
        return parseFloat(clean) || 0;
    }
    return 0;
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

        const processedLabelId = await ensureLabel(unitId);

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
                // ... attachment processing ...
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

                        // Refine mimeType for Gemini if it's octet-stream
                        let finalMimeType = mimeType;
                        if (finalMimeType === 'application/octet-stream' || !finalMimeType) {
                            if (filename.toLowerCase().endsWith('.pdf')) finalMimeType = 'application/pdf';
                            else if (filename.toLowerCase().endsWith('.jpg') || filename.toLowerCase().endsWith('.jpeg')) finalMimeType = 'image/jpeg';
                            else if (filename.toLowerCase().endsWith('.png')) finalMimeType = 'image/png';
                        }

                        // Ensure we don't send octet-stream to Gemini
                        if (finalMimeType === 'application/octet-stream') {
                            logScan(`  [!] Skipping document with unsupported mimeType: ${filename}`);
                            continue;
                        }

                        const analysis = await classifyAndExtractDocument(buffer, finalMimeType);

                        if (analysis.type === 'INVOICE' && analysis.data) {
                            const { nit, providerName, clientNit, invoiceNumber, totalAmount, date, concept } = analysis.data;

                            // Robust check for required fields from Gemini
                            if (!nit && !providerName) {
                                logScan(`  [!] Skipping invoice: Missing NIT and Provider Name`);
                                continue;
                            }

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
                                // Prefer AI concept, fallback to email subject
                                const finalDescription = (concept && concept.length > 3)
                                    ? concept
                                    : `Importado: ${(email.subject || 'Sin Asunto').substring(0, 100)}`;

                                const invDate = parseRobusDate(date);
                                const total = parseRobustAmount(totalAmount);

                                const inv = await prisma.invoice.create({
                                    data: {
                                        unitId, providerId: provider.id, invoiceNumber: invoiceNumber || 'SIN-REF',
                                        invoiceDate: invDate,
                                        totalAmount: total, subtotal: total, status: 'DRAFT',
                                        description: finalDescription,
                                        pdfUrl: fileUrl, fileUrl,
                                        source: 'GMAIL',
                                        emailSubject: email.subject || 'Sin Asunto',
                                        emailSender: email.from || 'Desconocido',
                                        emailDate: email.date ? new Date(email.date) : new Date()
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
                                    const payDate = parseRobusDate(date);
                                    const amount = parseRobustAmount(totalAmount);

                                    const pay = await prisma.payment.create({
                                        data: {
                                            unitId, paymentDate: payDate,
                                            amountPaid: amount, netValue: amount, sourceType: 'BANCO',
                                            bankPaymentMethod: bankName || 'GMAIL', transactionRef, status: 'DRAFT',
                                            supportFileUrl: fileUrl,
                                            source: 'GMAIL',
                                            emailSubject: email.subject,
                                            emailSender: email.from,
                                            emailDate: email.date ? new Date(email.date) : new Date()
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

            if (emailProcessed) await markAsProcessed(unitId, email.id, processedLabelId);

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
