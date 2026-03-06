import prisma from '../src/lib/prisma';

async function listAllTables() {
    console.log('🔍 Exhaustive Table Search across ALL schemas...\n');

    try {
        const tables: any[] = await prisma.$queryRawUnsafe(`
            SELECT table_schema, table_name 
            FROM information_schema.tables 
            WHERE table_type = 'BASE TABLE' 
              AND table_schema NOT IN ('information_schema', 'pg_catalog')
            ORDER BY table_schema, table_name;
        `);

        if (tables.length === 0) {
            console.log('⚠️ No tables found in any schema.');
        } else {
            console.log(`✅ Found ${tables.length} tables:`);
            tables.forEach(t => {
                console.log(` - ${t.table_schema}.${t.table_name}`);
            });
        }

        // Specifically look for anything looking like our tables
        const suspicious = tables.filter(t =>
            t.table_name.toLowerCase().includes('unit') ||
            t.table_name.toLowerCase().includes('invoice') ||
            t.table_name.toLowerCase().includes('payment')
        );

        if (suspicious.length > 0) {
            console.log('\n👀 Potentially relevant tables found:');
            suspicious.forEach(t => console.log(` - ${t.table_schema}.${t.table_name}`));
        } else {
            console.log('\n❌ No tables containing "unit", "invoice", or "payment" found.');
        }

    } catch (error: any) {
        console.error('❌ Error querying tables:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

listAllTables();
