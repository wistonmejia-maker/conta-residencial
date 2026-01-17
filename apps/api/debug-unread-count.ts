// debug-unread-count.ts
import { PrismaClient } from '@prisma/client';
import { getGmailClient } from './src/services/gmail.service';

async function run() {
    const prisma = new PrismaClient();
    try {
        const token = await prisma.gmailToken.findFirst();
        if (!token) throw new Error('No token');

        const gmail = await getGmailClient(token.unitId);

        // 1. Total attachments in last 24h (same as preview)
        const resAll = await gmail.users.messages.list({
            userId: 'me',
            q: 'has:attachment newer_than:1d',
            maxResults: 10
        });

        // 2. Unread attachments in last 24h (same as scan)
        const resUnread = await gmail.users.messages.list({
            userId: 'me',
            q: 'is:unread has:attachment newer_than:1d',
            maxResults: 10
        });

        console.log('--- GMAIL SYNC STATUS ---');
        console.log(`Total con adjuntos (últimas 24h): ${resAll.data.resultSizeEstimate || 0}`);
        console.log(`NO LEÍDOS con adjuntos (últimas 24h): ${resUnread.data.resultSizeEstimate || 0}`);

        if (resAll.data.messages) {
            console.log('\nÚltimos 5 mensajes con adjuntos:');
            for (const m of resAll.data.messages.slice(0, 5)) {
                const msg = await gmail.users.messages.get({ userId: 'me', id: m.id!, format: 'metadata', metadataHeaders: ['Subject', 'LabelIds'] });
                const labels = msg.data.labelIds || [];
                const isUnread = labels.includes('UNREAD');
                console.log(`- [${isUnread ? 'NO LEÍDO' : 'LEÍDO'}] Subject: ${msg.data.payload?.headers?.find(h => h.name === 'Subject')?.value}`);
            }
        }

    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}

run();
