import prisma from '../src/lib/prisma';

async function checkMigrations() {
    console.log('📜 Checking migration history in the database...\n');

    try {
        const migrations: any[] = await prisma.$queryRawUnsafe(`
            SELECT * FROM "_prisma_migrations" ORDER BY applied_steps_count DESC, finished_at DESC;
        `);

        if (migrations.length === 0) {
            console.log('⚠️ No migrations found in _prisma_migrations.');
        } else {
            console.log(`✅ Found ${migrations.length} migrations:`);
            migrations.forEach(m => {
                console.log(` - ${m.migration_name} (Applied at: ${m.finished_at})`);
            });
        }

    } catch (error: any) {
        console.error('❌ Error querying migrations:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkMigrations();
