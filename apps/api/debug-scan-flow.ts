// debug-scan-flow.ts
import { fetchNewEmails, getAttachment, markAsRead } from './src/services/gmail.service';
import { classifyAndExtractInvoice } from './src/services/ai.service';
import prisma from './src/lib/prisma';
import path from 'path';

// Force load .env
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function runScanFlow() {
    console.log('--- Starting Debug Scan Flow ---');

    try {
        const token = await prisma.gmailToken.findFirst();
        if (!token) throw new Error('No token found');
        const unitId = token.unitId;
        console.log(`Unit ID: ${unitId}`);

        console.log('1. Calling fetchNewEmails...');
        const emails = await fetchNewEmails(unitId);
        console.log(`   Fetched ${emails.length} emails.`);

        for (const email of emails) {
            console.log(`\nProcessing email: ${email.subject} (ID: ${email.id})`);

            for (const att of email.attachments) {
                console.log(`   Attachment: ${att.filename} (${att.mimeType})`);

                let buffer: Buffer | null = null;
                let mimeType = att.mimeType;

                try {
                    if (att.mimeType === 'application/pdf' || att.mimeType.startsWith('image/')) {
                        console.log('   Downloading PDF/Image...');
                        buffer = await getAttachment(unitId, email.id, att.attachmentId);
                    } else if (att.filename.endsWith('.zip')) {
                        console.log('   Downloading ZIP...');
                        const zipBuffer = await getAttachment(unitId, email.id, att.attachmentId);
                        const AdmZip = require('adm-zip');
                        const zip = new AdmZip(zipBuffer);
                        const zipEntries = zip.getEntries();
                        const pdfEntry = zipEntries.find((entry: any) =>
                            entry.entryName.toLowerCase().endsWith('.pdf') && !entry.isDirectory
                        );
                        if (pdfEntry) {
                            console.log(`   Found PDF in ZIP: ${pdfEntry.entryName}`);
                            buffer = pdfEntry.getData();
                            mimeType = 'application/pdf'; // override
                        }
                    }

                    if (buffer) {
                        console.log(`   Calling AI Service (${buffer.length} bytes)...`);
                        const analysis = await classifyAndExtractInvoice(buffer, mimeType);
                        console.log('   AI Result:', JSON.stringify(analysis, null, 2));
                    } else {
                        console.log('   No buffer to process.');
                    }

                } catch (innerErr) {
                    console.error('   !!! Error calling AI or processing attachment:', innerErr);
                }
            }
        }

    } catch (err) {
        console.error('!!! Critical Error in Scan Flow:', err);
    } finally {
        await prisma.$disconnect();
    }
}

runScanFlow();
