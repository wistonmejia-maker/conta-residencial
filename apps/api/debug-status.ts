import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function check() {
    try {
        const count = await prisma.invoice.count({
            where: { description: { contains: 'Importado de Gmail' } }
        });
        const recent = await prisma.invoice.findMany({
            where: { description: { contains: 'Importado de Gmail' } },
            orderBy: { createdAt: 'desc' },
            take: 5
        });

        console.log('--- SCAN STATUS ---');
        console.log(`Total Gmail Invoices: ${count}`);
        console.log('Latest 5:');
        recent.forEach(inv => {
            console.log(`- [${inv.createdAt.toISOString()}] ${inv.invoiceNumber} (${inv.providerId}) - PDF: ${inv.pdfUrl}`);
        });

        const uploadsDir = path.resolve(process.cwd(), 'uploads');
        if (fs.existsSync(uploadsDir)) {
            const files = fs.readdirSync(uploadsDir, { recursive: true });
            console.log(`\nFiles in uploads: ${files.length}`);
            files.slice(-10).forEach(f => console.log(`- ${f}`));
        } else {
            console.log('\nUploads directory does not exist yet.');
        }
    } catch (err) {
        console.error('Error checking status:', err);
    } finally {
        await prisma.$disconnect();
    }
}

check();
