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

    // Get unread emails
    const response = await gmail.users.messages.list({
        userId: 'me',
        q: 'is:unread',
        maxResults: 20,
    });

    const emails = [];

    for (const msg of response.data.messages || []) {
        const email = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id!,
            format: 'full',
        });

        const headers = email.data.payload?.headers || [];
        const getHeader = (name: string) =>
            headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

        // Get attachments
        const parts = email.data.payload?.parts || [];
        const attachments = [];
        for (const part of parts) {
            if (part.filename && part.body?.attachmentId) {
                attachments.push({
                    filename: part.filename,
                    mimeType: part.mimeType || 'application/octet-stream',
                    attachmentId: part.body.attachmentId,
                });
            }
        }

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
