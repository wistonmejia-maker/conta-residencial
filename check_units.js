
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const units = await prisma.unit.findMany({
        select: { id: true, name: true, logoUrl: true }
    });
    console.log(JSON.stringify(units, null, 2));
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
