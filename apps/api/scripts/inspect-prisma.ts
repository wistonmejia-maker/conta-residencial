import prisma from '../src/lib/prisma';

async function inspectPrisma() {
    console.log('=== Prisma Inspection ===');
    const keys = Object.keys(prisma);
    console.log('Prisma keys:', keys.filter(k => !k.startsWith('_')));

    // Check specifically for unit and aifeedback
    console.log('prisma.unit defined:', !!(prisma as any).unit);
    console.log('prisma.unit keys:', (prisma as any).unit ? Object.keys((prisma as any).unit) : 'N/A');

    console.log('prisma.aIFeedback defined:', !!(prisma as any).aIFeedback);
    console.log('prisma.aiFeedback defined:', !!(prisma as any).aiFeedback);
    console.log('prisma.aifeedback defined:', !!(prisma as any).aifeedback);

    await prisma.$disconnect();
}

inspectPrisma();
