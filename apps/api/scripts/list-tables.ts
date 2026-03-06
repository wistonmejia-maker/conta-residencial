import prisma from '../src/lib/prisma';

async function listTables() {
    console.log('🔍 Listing all tables in the database...\n');

    try {
        const tables: any[] = await prisma.$queryRawUnsafe(`
            SELECT table_schema, table_name 
            FROM information_schema.tables 
            WHERE table_type = 'BASE TABLE' 
              AND table_schema NOT IN ('information_schema', 'pg_catalog')
            ORDER BY table_schema, table_name;
        `);

        if (tables.length === 0) {
            console.log('⚠️ No tables found in the database.');
        } else {
            console.log(`✅ Found ${tables.length} tables:`);
            tables.forEach(t => console.log(` - ${t.table_schema}.${t.table_name}`));
        }

        // Also check for the database name
        const dbName: any[] = await prisma.$queryRawUnsafe('SELECT current_database();');
        console.log(`\nCurrent Database: ${dbName[0].current_database}`);

    } catch (error: any) {
        console.error('❌ Error querying tables:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

listTables();
