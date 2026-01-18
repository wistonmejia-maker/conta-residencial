
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkUnits() {
    try {
        const units = await prisma.unit.findMany({
            select: { id: true, name: true, gmailScanStartDate: true }
        });
        console.log('--- UNITS CONFIG ---');
        console.log(JSON.stringify(units, null, 2));
    } catch (e) {
        console.error('Error fetching units:', e);
    } finally {
        await prisma.$disconnect();
    }
}

checkUnits();
