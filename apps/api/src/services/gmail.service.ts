import { google } from 'googleapis';
import { oauth2Client } from '../config/google';
import prisma from '../lib/prisma';

export async function getGmailClient(unitId: string) {
    // Get tokens for unit
    const tokenRecord = await prisma.gmailToken.findUnique({
        where: { unitId }
    });

    if (!tokenRecord) {
        throw new Error('No Gmail token found for this unit');
    }

    // Check if token is expired (using BigInt conversion)
    const expiresAt = Number(tokenRecord.expiresAt);
    if (expiresAt < Date.now()) {
        // Refresh token
        oauth2Client.setCredentials({
            refresh_token: tokenRecord.refreshToken,
        });

        const { credentials } = await oauth2Client.refreshAccessToken();

        // Update stored tokens
        await prisma.gmailToken.update({
            where: { id: tokenRecord.id },
            data: {
                accessToken: credentials.access_token!,
                expiresAt: BigInt(credentials.expiry_date!),
            }
        });

        oauth2Client.setCredentials(credentials);
    } else {
        oauth2Client.setCredentials({
            access_token: tokenRecord.accessToken,
            refresh_token: tokenRecord.refreshToken,
        });
    }

    return google.gmail({ version: 'v1', auth: oauth2Client });
}

export async function fetchNewEmails(unitId: string) {
    const gmail = await getGmailClient(unitId);

    console.log(`[Gmail] Fetching unread emails for unit ${unitId}...`);

    // Get unread emails from the last 24h
    const response = await gmail.users.messages.list({
        userId: 'me',
        q: 'is:unread has:attachment newer_than:1d',
        maxResults: 50,
    });

    console.log(`[Gmail] Found ${response.data.resultSizeEstimate || 0} potential messages.`);

    const emails = [];

    for (const msg of response.data.messages || []) {
        console.log(`[Gmail] Fetching full message ${msg.id}...`);
        const email = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id!,
            format: 'full',
        });

        const headers = email.data.payload?.headers || [];
        const getHeader = (name: string) =>
            headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

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

        console.log(`[Gmail] Message ${msg.id} has ${attachments.length} attachments.`);

        emails.push({
            id: msg.id!,
            threadId: msg.threadId!,
            from: getHeader('from'),
            subject: getHeader('subject'),
            date: getHeader('date'),
            attachments,
        });
    }

    return emails;
}

export async function fetchRecentEmails(unitId: string, limit: number = 10) {
    const gmail = await getGmailClient(unitId);

    const response = await gmail.users.messages.list({
        userId: 'me',
        q: 'has:attachment newer_than:1d', // Filter by having attachments and date (last 24h)
        maxResults: limit,
    });

    const emails = [];

    for (const msg of response.data.messages || []) {
        try {
            const email = await gmail.users.messages.get({
                userId: 'me',
                id: msg.id!,
                format: 'metadata', // Lighter request
                metadataHeaders: ['From', 'Subject', 'Date']
            });

            const headers = email.data.payload?.headers || [];
            const getHeader = (name: string) =>
                headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

            emails.push({
                id: msg.id!,
                threadId: msg.threadId!,
                snippet: email.data.snippet,
                from: getHeader('from'),
                subject: getHeader('subject'),
                date: getHeader('date'),
            });
        } catch (err) {
            console.error(`Error fetching individual email ${msg.id}:`, err);
        }
    }

    return emails;
}


export async function getAttachment(unitId: string, messageId: string, attachmentId: string) {
    const gmail = await getGmailClient(unitId);

    const attachment = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId,
        id: attachmentId,
    });

    return Buffer.from(attachment.data.data!, 'base64');
}

export async function markAsRead(unitId: string, messageId: string) {
    const gmail = await getGmailClient(unitId);
    await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
            removeLabelIds: ['UNREAD'],
        },
    });
}
