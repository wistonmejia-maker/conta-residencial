/**
 * 🔒 Database Protection Validator - Conta Residencial
 *
 * Runs BEFORE any `prisma db push` or `prisma migrate deploy`.
 *
 * PRIMARY CHECK: Verifies the Neon endpoint ID in DATABASE_URL matches
 * the one registered for this project in EXPECTED_DB_ENDPOINT.
 *
 * SECONDARY CHECK: Detects schemas/tables from known foreign projects.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Client } = require('pg');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs');

// Manually load .env (without dotenv to avoid double-injection conflicts)
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx < 0) continue;
        const key = trimmed.substring(0, eqIdx).trim();
        let value = trimmed.substring(eqIdx + 1).trim();
        // Strip surrounding quotes
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = value;
    }
}

// Tables/schemas belonging to other known projects
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
    // CHECK 1: Endpoint ID fingerprint (most reliable, Neon-specific)
    // ─────────────────────────────────────────────────────────────
    const expectedEndpoint = process.env.EXPECTED_DB_ENDPOINT;
    if (expectedEndpoint) {
        // Extract endpoint ID — stop before -pooler suffix
        const match = dbUrl.match(/ep-[a-z0-9]+(?:-[a-z0-9]+)*?(?=-pooler|-direct|\.)/);
        const endpointInUrl = match ? match[0] : null;

        if (!endpointInUrl) {
            console.error('❌ ABORT: Could not extract Neon endpoint ID from DATABASE_URL.');
            process.exit(1);
        }

        if (endpointInUrl !== expectedEndpoint) {
            console.error(`❌ ABORT: Wrong Neon project!`);
            console.error(`   Expected endpoint : ${expectedEndpoint}`);
            console.error(`   Found in URL      : ${endpointInUrl}`);
            console.error(`\n   ➡️  Update DATABASE_URL in .env to point to the CONTA-RESIDENCIAL project.\n`);
            process.exit(1);
        }

        console.log(`✅ Endpoint ID matches: ${endpointInUrl}`);
    } else {
        console.warn('⚠️  EXPECTED_DB_ENDPOINT not set — skipping endpoint check.');
        console.warn('   Add EXPECTED_DB_ENDPOINT="ep-..." to .env for stronger protection.\n');
    }

    // ─────────────────────────────────────────────────────────────
    // CHECK 2: Schema / table contents (secondary safeguard)
    // ─────────────────────────────────────────────────────────────
    const client = new Client({ connectionString: dbUrl });
    try {
        await client.connect();

        const schemasRes = await client.query(
            `SELECT schema_name FROM information_schema.schemata
             WHERE schema_name NOT IN ('public','information_schema','pg_catalog','pg_toast');`
        );
        const badSchemas = schemasRes.rows
            .map(r => r.schema_name)
            .filter(s => FORBIDDEN_SCHEMAS.includes(s));

        if (badSchemas.length > 0) {
            console.error(`❌ ABORT: Foreign schema(s) detected: [${badSchemas.join(', ')}]`);
            console.error('   This database belongs to another project. Aborting migration.\n');
            process.exit(1);
        }

        const tablesRes = await client.query(
            `SELECT table_name FROM information_schema.tables
             WHERE table_schema = 'public' AND table_type = 'BASE TABLE';`
        );
        const existingTables = tablesRes.rows.map(r => r.table_name);
        const badTables = existingTables.filter(t =>
            FORBIDDEN_TABLES.some(f => t.toLowerCase() === f.toLowerCase())
        );

        if (badTables.length > 0) {
            console.error(`❌ ABORT: Foreign table(s) detected: [${badTables.join(', ')}]`);
            console.error('   This database belongs to another project. Aborting migration.\n');
            process.exit(1);
        }

        console.log('✅ No foreign schemas or tables detected.');
        console.log('\n✅ Database confirmed to belong to Conta Residencial.');
        console.log('▶️  Proceeding with migration...\n');

    } catch (err) {
        console.error('❌ ABORT: Could not connect to the database:', err.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

validateDatabase();
