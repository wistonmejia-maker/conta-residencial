import prisma from '../src/lib/prisma';

async function analyzeTimestamps() {
    console.log('🕒 Analyzing migration timestamps in the current database...\n');

    try {
        const migrations: any[] = await prisma.$queryRawUnsafe(`
            SELECT migration_name, finished_at FROM "_prisma_migrations" 
            ORDER BY finished_at DESC;
        `);

        console.log(`✅ Found ${migrations.length} migrations in current database:`);
        migrations.forEach(m => {
            console.log(` - ${m.migration_name} (Applied at: ${m.finished_at})`);
        });

    } catch (error: any) {
        console.error('❌ Error querying migrations:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

analyzeTimestamps();
