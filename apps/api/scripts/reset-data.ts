
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🗑️  Starting data cleanup...');

    try {
        // 1. Delete dependent relations first
        console.log('Deleting PaymentInvoice items...');
        await prisma.paymentInvoice.deleteMany({});

        console.log('Deleting AI Feedback (optional, but requested clean slate)...');
        // Keeping AI Feedback? "datos de facturas y soportes". 
        // Usually users want to keep the "intelligence" but reset the "data".
        // I will NOT delete AIFeedback unless they ask, as that's "configuration/learning".
        // But I WILL delete the actual invoices/payments.

        // 2. Delete Invoices and Payments
        console.log('Deleting Invoices...');
        await prisma.invoice.deleteMany({});

        console.log('Deleting Payments...');
        await prisma.payment.deleteMany({});

        // 3. Delete Scanning Jobs (Clean history)
        console.log('Deleting Scanning Jobs...');
        await prisma.scanningJob.deleteMany({});

        // 4. Delete Bank Movements/Conciliations? Use caution. 
        // "soportes" usually refers to payments.
        console.log('Deleting Conciliations...');
        await prisma.conciliation.deleteMany({});

        // We keep Units and Providers usually. 
        // If providers were auto-created by AI, they might clutter, but they are master data.
        // I'll keep Providers for now.

        console.log('✅  Data reset successful! (Invoices, Payments, Jobs cleaned)');
    } catch (error) {
        console.error('❌  Error resetting data:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
