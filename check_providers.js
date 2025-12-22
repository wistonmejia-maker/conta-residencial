const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const count = await prisma.provider.count();
    const providers = await prisma.provider.findMany({ take: 5 });
    console.log(`Total providers: ${count}`);
    console.log('Sample providers:', JSON.stringify(providers, null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
