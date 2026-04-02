import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('Checking last 5 payments...');
    const payments = await prisma.payment.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
            report: true,
            conciliation: true
        }
    });

    payments.forEach(p => {
        console.log(`- ID: ${p.id}`);
        console.log(`  Provider: ${p.providerId}`);
        console.log(`  Status: ${p.status}`);
        console.log(`  monthlyReportId: ${p.monthlyReportId}`);
        console.log(`  Conciliation: ${p.conciliation ? 'YES' : 'NO'}`);
        console.log(`  Consecutive: ${p.consecutiveNumber}`);
        console.log('---');
    });
}

main().catch(console.error).finally(() => prisma.$disconnect());
