const { PrismaClient } = require('./apps/api/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const unitId = '07563394-b5b1-4a09-a92a-e79c264f20e2';

        console.log('--- Iniciando Re-secuencia de CEs ---');

        await prisma.$transaction(async (tx) => {
            // 1. Shift 950 -> 949
            const p950 = await tx.payment.updateMany({
                where: { unitId, consecutiveNumber: 950 },
                data: { consecutiveNumber: 949 }
            });
            console.log(`- 950 -> 949: ${p950.count} registros afectados`);

            // 2. Shift 951 -> 950
            const p951 = await tx.payment.updateMany({
                where: { unitId, consecutiveNumber: 951 },
                data: { consecutiveNumber: 950 }
            });
            console.log(`- 951 -> 950: ${p951.count} registros afectados`);

            // 3. Shift 952 -> 951
            const p952 = await tx.payment.updateMany({
                where: { unitId, consecutiveNumber: 952 },
                data: { consecutiveNumber: 951 }
            });
            console.log(`- 952 -> 951: ${p952.count} registros afectados`);

            // 4. Update seed to 952 (the next expected number)
            await tx.unit.update({
                where: { id: unitId },
                data: { consecutiveSeed: 952 }
            });
            console.log(`- Semilla de unidad actualizada a: 952`);
        });

        console.log('\n--- Re-secuencia finalizada con éxito ---');

    } catch (err) {
        console.error('Error durante la re-secuencia:', err);
    } finally {
        await prisma.$disconnect();
    }
}

main();
