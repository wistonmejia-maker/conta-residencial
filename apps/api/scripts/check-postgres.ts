import { PrismaClient } from '@prisma/client';

async function checkPostgresDB() {
    const url = process.env.DATABASE_URL!.replace('/neondb', '/postgres');
    console.log(`🔍 Checking tables in database: postgres\n`);

    const prisma = new PrismaClient({
        datasources: {
            db: {
                url: url
            }
        }
    });

    try {
        const tables: any[] = await prisma.$queryRawUnsafe(`
            SELECT table_schema, table_name 
            FROM information_schema.tables 
            WHERE table_type = 'BASE TABLE' 
              AND table_schema NOT IN ('information_schema', 'pg_catalog')
            ORDER BY table_schema, table_name;
        `);

        if (tables.length === 0) {
            console.log('⚠️ No tables found in postgres database.');
        } else {
            console.log(`✅ Found ${tables.length} tables:`);
            tables.forEach(t => console.log(` - ${t.table_schema}.${t.table_name}`));
        }

    } catch (error: any) {
        console.error('❌ Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkPostgresDB();
