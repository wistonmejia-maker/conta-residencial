import { PrismaClient } from '@prisma/client';

async function checkLocalDB() {
    const url = 'postgresql://postgres:postgres@localhost:5432/conta_residencial';
    console.log(`🔍 Checking local database: ${url}\n`);

    const prisma = new PrismaClient({
        datasources: {
            db: {
                url: url
            }
        }
    });

    try {
        const tables: any[] = await prisma.$queryRawUnsafe(`
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name;
        `);

        if (tables.length === 0) {
            console.log('⚠️ No tables found in local database.');
        } else {
            console.log(`✅ Found ${tables.length} tables:`);
            tables.forEach(t => console.log(` - ${t.table_name}`));
        }

    } catch (error: any) {
        console.error('❌ Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkLocalDB();
