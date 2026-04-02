const { PrismaClient } = require('./apps/api/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const unitId = '07563394-b5b1-4a09-a92a-e79c264f20e2';
        
        // Use lowercase column names for PostgreSQL raw query
        const sequence = await prisma.$queryRaw`
            SELECT id, consecutive_number, source_type, amount_paid, payment_date, created_at, status 
            FROM payments 
            WHERE unit_id = ${unitId} AND consecutive_number BETWEEN 940 AND 955
            ORDER BY consecutive_number ASC
        `;
        
        console.log('--- Secuencia Detallada ---');
        console.log(JSON.stringify(sequence, null, 2));

        const seed = await prisma.$queryRaw`SELECT consecutive_seed FROM units WHERE id = ${unitId}`;
        console.log('\nSeed Actual:', seed[0].consecutive_seed);

    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}

main();
