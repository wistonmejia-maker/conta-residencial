// debug-check-criteria.ts
import { getGmailClient } from './src/services/gmail.service';
import prisma from './src/lib/prisma';

async function checkCriteria() {
    try {
        console.log('Finding unit...');
        const token = await prisma.gmailToken.findFirst();
        if (!token) throw new Error('No token found');

        const unitId = token.unitId;
        const gmail = await getGmailClient(unitId);

        // replicate exact query from gmail.service.ts
        const query = 'is:unread has:attachment newer_than:30d';
        console.log(`Searching with query: "${query}"`);

        const response = await gmail.users.messages.list({
            userId: 'me',
            q: query,
            maxResults: 50,
        });

        const messages = response.data.messages || [];
        console.log(`Found ${messages.length} messages matching criteria.`);

        for (const msg of messages) {
            const email = await gmail.users.messages.get({
                userId: 'me',
                id: msg.id!,
                format: 'metadata',
                metadataHeaders: ['Subject', 'Date', 'From']
            });

            const headers = email.data.payload?.headers || [];
            const subject = headers.find(h => h.name === 'Subject')?.value;
            const date = headers.find(h => h.name === 'Date')?.value;

            console.log(`- [${date}] ${subject} (ID: ${msg.id})`);
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await prisma.$disconnect();
    }
}

checkCriteria();
