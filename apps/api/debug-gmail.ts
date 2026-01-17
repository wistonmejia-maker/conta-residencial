// @ts-nocheck
// debug-gmail.ts
import { google } from 'googleapis';
import { getGmailClient, getAttachment } from './src/services/gmail.service';
import { classifyAndExtractInvoice } from './src/services/ai.service';
import prisma from './src/lib/prisma';
import fs from 'fs';
import path from 'path';

const LOG_FILE = path.join(__dirname, 'debug_log.txt');
fs.writeFileSync(LOG_FILE, '');

function log(...args: any[]) {
    console.log(...args);
    fs.appendFileSync(LOG_FILE, args.join(' ') + '\n');
}

async function run() {
    try {
        log('Finding a unit with Gmail token...');
        const token = await prisma.gmailToken.findFirst();

        if (!token) {
            console.error('No Gmail token found in DB.');
            process.exit(1);
        }

        const unitId = token.unitId;
        log(`Found unit: ${unitId}`);

        const gmail = await getGmailClient(unitId);

        log('Fetching SPECIFIC debug email (subject: 900078962)...');
        const response = await gmail.users.messages.list({
            userId: 'me',
            q: 'subject:900078962',
            maxResults: 5,
        });

        const messages = response.data.messages || [];
        log(`Found ${messages.length} matching emails.`);

        for (const msg of messages) {
            const email = await gmail.users.messages.get({
                userId: 'me',
                id: msg.id!,
                format: 'full',
            });

            const headers = email.data.payload?.headers || [];
            const getHeader = (name: string) =>
                headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

            log(`\n---------------------------------`);
            log(`Subject: ${getHeader('subject')}`);
            log(`From: ${getHeader('from')}`);

            // Recursive attachment finder
            const attachments: { filename: string; mimeType: string; attachmentId: string }[] = [];
            const findAttachments = (parts: any[]) => {
                for (const part of parts) {
                    if (part.filename && part.body?.attachmentId) {
                        attachments.push({
                            filename: part.filename,
                            mimeType: part.mimeType || 'application/octet-stream',
                            attachmentId: part.body.attachmentId,
                        });
                    }
                    if (part.parts) {
                        findAttachments(part.parts);
                    }
                }
            };

            if (email.data.payload?.parts) {
                findAttachments(email.data.payload.parts);
            }

            log(`Attachments found: ${attachments.length}`);

            for (const att of attachments) {
                log(`  - Attachment: ${att.filename} (${att.mimeType})`);

                let buffer: Buffer | null = null;
                let mimeType = att.mimeType;

                try {
                    if (att.mimeType === 'application/pdf' || att.filename.endsWith('.pdf')) {
                        log('    -> Downloading PDF...');
                        buffer = await getAttachment(unitId, msg.id, att.attachmentId);
                    }
                    else if (att.mimeType.includes('zip') || att.filename.endsWith('.zip')) {
                        log('    -> Found ZIP. Downloading and extracting...');
                        const zipBuffer = await getAttachment(unitId, msg.id, att.attachmentId);

                        const AdmZip = require('adm-zip');
                        const zip = new AdmZip(zipBuffer);
                        const zipEntries = zip.getEntries();

                        const pdfEntry = zipEntries.find((entry: any) =>
                            entry.entryName.toLowerCase().endsWith('.pdf') && !entry.isDirectory
                        );

                        if (pdfEntry) {
                            log(`    -> Extracted PDF from ZIP: ${pdfEntry.entryName}`);
                            buffer = pdfEntry.getData();
                            mimeType = 'application/pdf';
                        } else {
                            log('    -> No PDF found in ZIP.');
                        }
                    }

                    if (buffer) {
                        log(`    -> Sending ${buffer.length} bytes to AI...`);
                        const analysis = await classifyAndExtractInvoice(buffer, mimeType);
                        log('    -> AI Result:', JSON.stringify(analysis, null, 2));

                        if (analysis.isInvoice && analysis.data) {
                            log('    -> SUCCESS: Identified as Invoice!');

                            // Check Provider
                            const { nit } = analysis.data;
                            const provider = await prisma.provider.findUnique({ where: { nit } });
                            log(`    -> Provider exists? ${!!provider}`);
                        } else {
                            log('    -> FAILED: AI said it is NOT an invoice.');
                        }
                    }

                } catch (err) {
                    console.error('    -> Error processing attachment:', err);
                    log('    -> Error processing attachment: ' + err);
                }
            }
        }

    } catch (error) {
        console.error('CRITICAL ERROR:', error);
        log('CRITICAL ERROR: ' + error);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}

run();
