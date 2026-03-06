/**
 * 🔒 Database Protection Validator - Conta Residencial
 *
 * Runs BEFORE any `prisma db push` or `prisma migrate deploy`.
 *
 * PRIMARY CHECK: Verifies the Neon endpoint ID in DATABASE_URL matches
 * the one registered for this project in EXPECTED_DB_ENDPOINT.
 *
 * SECONDARY CHECK: Detects tables from known foreign projects as a fallback.
 *
 * Setup:
 *   1. Add EXPECTED_DB_ENDPOINT to your .env:
 *      EXPECTED_DB_ENDPOINT="ep-floral-star-ad96dnn6"
 *   2. The scripts in package.json call this automatically before any migration.
 */

import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

// 🚨 Tables from foreign projects — present = WRONG database
const FORBIDDEN_TABLES = ['BusinessLine', 'Product', 'Sale', 'Transaction', 'Market', 'Scenario'];
const FORBIDDEN_SCHEMAS = ['business_planning'];

async function validateDatabase() {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        console.error('❌ ABORT: DATABASE_URL is not set in .env');
        process.exit(1);
    }

    console.log('\n🔒 Conta Residencial — Database Ownership Validator\n');

    // ─────────────────────────────────────────────────────────────
    // CHECK 1: Endpoint ID fingerprint (Neon-specific, most reliable)
    // ─────────────────────────────────────────────────────────────
    const expectedEndpoint = process.env.EXPECTED_DB_ENDPOINT;
    if (expectedEndpoint) {
        const endpointInUrl = dbUrl.match(/ep-[a-z0-9\-]+/)?.[0];
        if (!endpointInUrl) {
            console.error('❌ ABORT: Could not extract endpoint ID from DATABASE_URL.');
            process.exit(1);
        }
        if (endpointInUrl !== expectedEndpoint) {
            console.error(`❌ ABORT: Wrong Neon project!`);
            console.error(`   Expected endpoint : ${expectedEndpoint}`);
            console.error(`   Found in URL      : ${endpointInUrl}`);
            console.error(`\n   Update DATABASE_URL in .env to point to the CONTA-RESIDENCIAL project.\n`);
            process.exit(1);
        }
        console.log(`✅ Endpoint ID matches: ${endpointInUrl}`);
    } else {
        console.warn('⚠️  EXPECTED_DB_ENDPOINT not set in .env — skipping endpoint check.');
        console.warn('   Add EXPECTED_DB_ENDPOINT="ep-..." to your .env for stronger protection.\n');
    }

    // ─────────────────────────────────────────────────────────────
    // CHECK 2: Schema / table content (secondary safeguard)
    // ─────────────────────────────────────────────────────────────
    const client = new Client({ connectionString: dbUrl });
    try {
        await client.connect();

        // Check forbidden schemas
        const schemasRes = await client.query(`
            SELECT schema_name FROM information_schema.schemata
            WHERE schema_name NOT IN ('public','information_schema','pg_catalog','pg_toast');
        `);
        const badSchemas = schemasRes.rows
            .map((r: any) => r.schema_name as string)
            .filter((s: string) => FORBIDDEN_SCHEMAS.includes(s));

        if (badSchemas.length > 0) {
            console.error(`❌ ABORT: Foreign schema(s) detected: [${badSchemas.join(', ')}]`);
            console.error('   This database belongs to another project.\n');
            process.exit(1);
        }

        // Check forbidden tables
        const tablesRes = await client.query(`
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
        `);
        const existingTables = tablesRes.rows.map((r: any) => r.table_name as string);
        const badTables = existingTables.filter((t: string) =>
            FORBIDDEN_TABLES.some(f => t.toLowerCase() === f.toLowerCase())
        );

        if (badTables.length > 0) {
            console.error(`❌ ABORT: Foreign table(s) detected: [${badTables.join(', ')}]`);
            console.error('   This database belongs to another project.\n');
            process.exit(1);
        }

        console.log('✅ No foreign schemas or tables detected.');
        console.log('\n✅ Database is confirmed to belong to Conta Residencial.');
        console.log('▶️  Proceeding with migration...\n');

    } catch (err: any) {
        console.error('❌ ABORT: Could not connect to the database:', err.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

validateDatabase();
