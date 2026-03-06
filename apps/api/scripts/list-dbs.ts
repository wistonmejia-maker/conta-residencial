import prisma from '../src/lib/prisma';

async function listDatabases() {
    console.log('🔍 Listing all databases in the cluster...\n');

    try {
        const dbs: any[] = await prisma.$queryRawUnsafe(`
            SELECT datname FROM pg_database WHERE datistemplate = false;
        `);

        console.log(`✅ Found ${dbs.length} databases:`);
        dbs.forEach(db => console.log(` - ${db.datname}`));

        const schemas: any[] = await prisma.$queryRawUnsafe(`
            SELECT schema_name FROM information_schema.schemata 
            WHERE schema_name NOT IN ('information_schema', 'pg_catalog')
              AND schema_name NOT LIKE 'pg_toast%'
              AND schema_name NOT LIKE 'pg_temp%';
        `);

        console.log(`\n✅ Found ${schemas.length} schemas in current DB:`);
        schemas.forEach(s => console.log(` - ${s.schema_name}`));

    } catch (error: any) {
        console.error('❌ Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

listDatabases();
