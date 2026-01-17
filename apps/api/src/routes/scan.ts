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

// Helper to upload buffer (Cloudinary or Local)
async function uploadBuffer(buffer: Buffer, filename: string, folder: string = 'general'): Promise<string> {
    // Check if Cloudinary is configured with REAL values (not placeholders)
    const useCloudinary = !!(
        process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_CLOUD_NAME !== 'your_cloud_name' &&
        process.env.CLOUDINARY_API_KEY
    );

    if (useCloudinary) {
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: `conta-residencial/${folder}`,
                    resource_type: 'auto',
                    public_id: filename.replace(/\.[^/.]+$/, "") // Remove extension for public_id
                },
                (error: any, result: any) => {
                    if (error) reject(error);
                    else resolve(result!.secure_url);
                }
            );
            uploadStream.end(buffer);
        });
    } else {
        // Local storage - Use process.cwd() to be safe in ts-node/dev environments
        const uploadsDir = path.resolve(process.cwd(), 'uploads');
        const destDir = path.join(uploadsDir, folder);

        console.log(`[STORAGE] Target directory: ${destDir}`);

        try {
            if (!fs.existsSync(destDir)) {
                console.log(`[STORAGE] Creating directory: ${destDir}`);
                fs.mkdirSync(destDir, { recursive: true });
            }

            const timestamp = Date.now();
            const safeName = filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
            const finalName = `${timestamp}-${safeName}`;
            const filePath = path.join(destDir, finalName);

            console.log(`[STORAGE] Writing file to: ${filePath} (${buffer.length} bytes)`);
            fs.writeFileSync(filePath, buffer);

            // Verify file exists
            if (fs.existsSync(filePath)) {
                console.log(`[STORAGE] File written successfully.`);
            } else {
                throw new Error('File not found after write');
            }

            // Return URL for database
            // Note: Frontend must be able to resolve this. 
            // If the API serves /uploads, this works.
            return `http://localhost:3002/uploads/${folder}/${finalName}`;
        } catch (err) {
            console.error('[STORAGE] Critical error writing file:', err);
            throw err;
        }
    }
}

const SCAN_LOG = path.join(process.cwd(), 'scan_debug.log');
function logScan(msg: string) {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFileSync(SCAN_LOG, line);
    console.log(msg);
}

// POST /scan-gmail?unitId=...
router.post('/scan-gmail', async (req, res) => {
    const { unitId } = req.query;

    if (!unitId) return res.status(400).send({ error: 'Unit ID is required' });

    logScan(`Gmail Scan Started for unit ${unitId}`);

    try {
        const unit = await prisma.unit.findUnique({ where: { id: unitId as string } });
        if (!unit) return res.status(404).send({ error: 'Unit not found' });

        const emails = await fetchNewEmails(unitId as string);
        const results = [];
        logScan(`Found ${emails.length} unread emails with attachments.`);

        if (emails.length === 0) {
            logScan(`No unread emails with attachments found in the last 24h.`);
        }

        for (let i = 0; i < emails.length; i++) {
            const email = emails[i];
            console.log(`[SCAN] (${i + 1}/${emails.length}) Processing: "${email.subject}"`);
            let processed = false;

            for (const att of email.attachments) {
                let buffer: Buffer | null = null;
                let mimeType = att.mimeType;
                let filename = att.filename;

                try {
                    const isPdf = mimeType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf');
                    const isImage = mimeType.startsWith('image/');
                    const isZip = mimeType === 'application/zip' ||
                        mimeType === 'application/x-zip-compressed' ||
                        filename.toLowerCase().endsWith('.zip');

                    if (isPdf || isImage) {
                        logScan(`  -> Downloading ${isPdf ? 'PDF' : 'Image'}: ${filename} (MIME: ${mimeType})`);
                        buffer = await getAttachment(unitId as string, email.id, att.attachmentId);
                    }
                    else if (isZip) {
                        logScan(`  -> ZIP detected: ${filename} (MIME: ${mimeType})`);
                        const zipBuffer = await getAttachment(unitId as string, email.id, att.attachmentId);

                        try {
                            const AdmZip = require('adm-zip');
                            const zip = new AdmZip(zipBuffer);
                            const zipEntries = zip.getEntries();
                            const pdfEntry = zipEntries.find((entry: any) =>
                                entry.entryName.toLowerCase().endsWith('.pdf') && !entry.isDirectory
                            );

                            if (pdfEntry) {
                                logScan(`  -> Extracted PDF from ZIP: ${pdfEntry.entryName}`);
                                buffer = pdfEntry.getData();
                                mimeType = 'application/pdf';
                                filename = pdfEntry.entryName;
                            } else {
                                logScan(`  -> No PDF found inside ZIP.`);
                            }
                        } catch (zipError) {
                            logScan(`  -> ZIP Extract Error: ${zipError}`);
                        }
                    } else {
                        logScan(`  -> Skipping attachment: ${filename} (MIME: ${mimeType}) - Not a supported type.`);
                    }

                    if (buffer) {
                        console.log(`  -> AI Analysis started...`);
                        // Rate Limiting: Wait 4s before calling AI
                        await new Promise(r => setTimeout(r, 4000));

                        const analysis = await classifyAndExtractDocument(buffer, mimeType);
                        logScan(`  -> AI Result: type=${analysis.type}`);

                        if (analysis.type === 'INVOICE' && analysis.data) {
                            const { nit, providerName, clientNit, invoiceNumber, totalAmount, date, concept } = analysis.data;

                            if (!nit || !providerName) {
                                logScan(`  [!] Error: El AI no extrajo el NIT o el nombre del emisor. Saltando...`);
                                continue;
                            }

                            logScan(`  -> Extracted Invoice: ${providerName} (Emisor: ${nit}) | Cliente: ${clientNit} | Factura: ${invoiceNumber}`);

                            // VALIDATION: Check if invoice belongs to this unit
                            const cleanUnitNit = unit.taxId.replace(/[^0-9]/g, '');
                            const cleanInvoiceClientNit = clientNit ? clientNit.replace(/[^0-9]/g, '') : '';

                            if (cleanInvoiceClientNit && !cleanUnitNit.includes(cleanInvoiceClientNit) && !cleanUnitNit.includes(cleanInvoiceClientNit)) {
                                logScan(`  [!] ALERTA: El NIT del cliente (${clientNit}) no coincide con el de la unidad (${unit.taxId}). Saltando...`);
                                continue;
                            }

                            // Upload File
                            let fileUrl = await uploadBuffer(buffer, filename, `units/${unitId}/invoices`);

                            // 1. Find or Create Provider
                            let provider = await prisma.provider.findUnique({ where: { nit: nit! } });
                            if (!provider) {
                                provider = await prisma.provider.create({
                                    data: {
                                        name: providerName!,
                                        nit: nit!,
                                        taxType: 'NIT',
                                        dv: '0',
                                        email: email.from.match(/<(.+)>/)?.[1] || '',
                                    }
                                });
                            }

                            // 2. Create Invoice Draft
                            const newInvoice = await prisma.invoice.create({
                                data: {
                                    unitId: unitId as string,
                                    providerId: provider.id,
                                    invoiceNumber: invoiceNumber || 'SIN-REF',
                                    invoiceDate: date ? new Date(date) : new Date(),
                                    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                                    subtotal: totalAmount,
                                    totalAmount: totalAmount,
                                    status: 'DRAFT',
                                    description: `Importado de Gmail: ${email.subject} - ${concept}`,
                                    pdfUrl: fileUrl,
                                    fileUrl: fileUrl
                                }
                            });

                            results.push({ status: 'created', type: 'invoice', id: newInvoice.id, file: filename });
                            processed = true;
                        }
                        else if (analysis.type === 'PAYMENT_RECEIPT' && analysis.data) {
                            const { totalAmount, date, concept, transactionRef, bankName } = analysis.data;

                            if (totalAmount === undefined || totalAmount === null) {
                                logScan(`  [!] Error: El AI no extrajo el monto total del comprobante. Saltando...`);
                                continue;
                            }

                            logScan(`  -> Extracted Payment: ${bankName} | $${totalAmount} | Ref: ${transactionRef}`);

                            // Upload File
                            const fileUrl = await uploadBuffer(buffer, filename, `units/${unitId}/payments`);

                            // Create Payment Draft
                            const newPayment = await prisma.payment.create({
                                data: {
                                    unitId: unitId as string,
                                    paymentDate: date ? new Date(date) : new Date(),
                                    amountPaid: totalAmount,
                                    netValue: totalAmount,
                                    sourceType: 'BANCO',
                                    bankPaymentMethod: bankName || 'GMAIL_IMPORT',
                                    transactionRef: transactionRef || 'GMAIL_IMPORT',
                                    status: 'DRAFT',
                                    supportFileUrl: fileUrl,
                                }
                            });

                            results.push({ status: 'created', type: 'payment', id: newPayment.id, file: filename });
                            processed = true;
                        }
                        else {
                            logScan(`  -> AI decided this is not a supported document type or data is missing.`);
                        }
                    }
                } catch (processingError: any) {
                    logScan(`  -> System Error for ${filename}: ${processingError.message}`);
                    if (processingError.message?.includes('429')) {
                        logScan('  -> Rate limit hit. Extra 10s wait...');
                        await new Promise(r => setTimeout(r, 10000));
                    }
                }
            }

            if (processed) {
                logScan(`  -> Marking email as read: ${email.id}`);
                await markAsRead(unitId as string, email.id);
            }
        }

        logScan(`Scan finished for unit ${unitId}. Processed: ${results.length}`);
        res.json({ success: true, processedCount: results.length, results });

    } catch (error) {
        console.error('[SCAN] Critical Scan Error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// POST /api/scan/analyze - Analyze a manually uploaded file
router.post('/analyze', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const buffer = req.file.buffer;
        const mimeType = req.file.mimetype;

        const analysis = await classifyAndExtractDocument(buffer, mimeType);
        res.json(analysis);
    } catch (error) {
        console.error('Error analyzing document:', error);
        res.status(500).json({ error: 'Error analyzing document' });
    }
});

export default router;
