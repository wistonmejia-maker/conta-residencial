import { Router } from 'express';
import prisma from '../lib/prisma';
import { fetchNewEmails, getAttachment, markAsRead } from '../services/gmail.service';
import { classifyAndExtractInvoice } from '../services/ai.service';
// ... existing imports

const router = Router();

// POST /scan-gmail?unitId=...
router.post('/scan-gmail', async (req, res) => {
    const { unitId } = req.query;

    if (!unitId) return res.status(400).send({ error: 'Unit ID is required' });

    console.log(`Scanning Gmail for unit ${unitId}...`);

    try {
        const emails = await fetchNewEmails(unitId as string);
        const results = [];

        for (const email of emails) {
            console.log(`Processing email: ${email.subject}`);
            let processed = false;

            for (const att of email.attachments) {
                // Check if PDF or Image
                if (att.mimeType === 'application/pdf' || att.mimeType.startsWith('image/')) {
                    console.log(`  Downloading attachment: ${att.filename}`);
                    const buffer = await getAttachment(unitId as string, email.id, att.attachmentId);

                    const analysis = await classifyAndExtractInvoice(buffer, att.mimeType);

                    if (analysis.isInvoice && analysis.data) {
                        const { nit, providerName, invoiceNumber, totalAmount, issueDate, concept } = analysis.data;

                        // 1. Find or Create Provider
                        let provider = await prisma.provider.findUnique({ where: { nit } });
                        if (!provider) {
                            // Basic Provider Creation
                            provider = await prisma.provider.create({
                                data: {
                                    name: providerName,
                                    nit,
                                    taxType: 'NIT',
                                    dv: '0', // Placeholder
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
                                invoiceDate: issueDate ? new Date(issueDate) : new Date(),
                                dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // +30 days default
                                subtotal: totalAmount, // Assuming no tax separation for simplified AI
                                totalAmount: totalAmount,
                                status: 'PENDING',
                                observations: `Importado de Gmail: ${email.subject} - ${concept}`,
                                concept
                            }
                        });

                        results.push({
                            status: 'created',
                            invoice: newInvoice,
                            file: att.filename
                        });
                        processed = true;
                    }
                }
            }

            if (processed) {
                await markAsRead(unitId as string, email.id);
            }
        }

        res.json({ success: true, processedCount: results.length, results });

    } catch (error) {
        console.error('Error scanning Gmail:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// ... existing routes
export default router;
