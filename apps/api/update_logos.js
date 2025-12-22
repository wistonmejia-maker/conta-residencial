
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const u1 = await prisma.unit.updateMany({
        where: { name: { contains: 'CIUDAD JARDIN' } },
        data: { logoUrl: '/uploads/general/1766349299147-Logo_Ciudad_Jardin.png' }
    });
    console.log(`Updated ${u1.count} units for Ciudad Jardin`);

    const u2 = await prisma.unit.updateMany({
        where: { name: { contains: 'TREVISO' } },
        data: { logoUrl: '/uploads/general/1766349310901-LogoTreviso.png' }
    });
    console.log(`Updated ${u2.count} units for Treviso`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
