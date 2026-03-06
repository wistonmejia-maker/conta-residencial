// merge-duplicate-provider.js
// Fusiona duplicados de un proveedor dado un NIT base
// Reasigna facturas del duplicado al principal y lo elimina.

const { Client } = require('pg')

const NIT_BASE = '16288675' // JULIO CESAR GUZMAN GONZALEZ

async function main() {
    const db = new Client({ connectionString: process.env.DATABASE_URL })
    await db.connect()

    const { rows } = await db.query(`
        SELECT id, name, nit, dv,
               (SELECT COUNT(*) FROM invoices WHERE provider_id = providers.id) AS facturas
        FROM providers
        WHERE nit LIKE $1
        ORDER BY created_at ASC
    `, [NIT_BASE + '%'])

    console.log(`\n📋 Registros encontrados (${rows.length}):`)
    rows.forEach(r => console.log(`  - "${r.name}"  NIT: ${r.nit}  Facturas: ${r.facturas}  ID: ${r.id}`))

    if (rows.length < 2) {
        console.log('\n✅ Solo hay un registro, nada que fusionar.')
        await db.end(); return
    }

    // Principal = NIT más limpio (solo dígitos), o el primero cronológicamente
    const principal = rows.find(r => /^[0-9]+$/.test(r.nit)) || rows[0]
    const duplicates = rows.filter(r => r.id !== principal.id)

    console.log(`\n🎯 Principal: "${principal.name}" (${principal.nit}) — ${principal.facturas} facturas`)

    for (const dup of duplicates) {
        console.log(`\n🔀 Fusionando duplicado: "${dup.name}" (${dup.nit}) — ${dup.facturas} facturas`)

        const { rowCount: inv } = await db.query(
            'UPDATE invoices SET provider_id = $1 WHERE provider_id = $2',
            [principal.id, dup.id]
        )
        console.log(`   ✅ Facturas reasignadas: ${inv}`)

        await db.query('DELETE FROM provider_unit_configs WHERE provider_id = $1', [dup.id]).catch(() => { })
        await db.query('UPDATE provider_documents SET provider_id = $1 WHERE provider_id = $2', [principal.id, dup.id]).catch(() => { })
        await db.query('DELETE FROM providers WHERE id = $1', [dup.id])
        console.log(`   🗑️  Duplicado eliminado`)
    }

    // Fix NIT/DV on principal if needed
    function calcularDV(nit) {
        const n = nit.replace(/[^0-9]/g, '')
        const primos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71]
        let suma = 0
        for (let i = 0; i < n.length; i++) suma += parseInt(n[n.length - 1 - i]) * primos[i]
        const r = suma % 11
        return String(r === 0 || r === 1 ? r : 11 - r)
    }
    const cleanNit = NIT_BASE
    const correctDv = calcularDV(cleanNit)
    await db.query('UPDATE providers SET nit = $1, dv = $2, updated_at = NOW() WHERE id = $3', [cleanNit, correctDv, principal.id])

    const { rows: final } = await db.query(
        `SELECT name, nit, dv, (SELECT COUNT(*) FROM invoices WHERE provider_id = providers.id) AS facturas FROM providers WHERE id = $1`,
        [principal.id]
    )
    console.log(`\n✅ Resultado final: "${final[0].name}" NIT: ${final[0].nit}-${final[0].dv} | ${final[0].facturas} facturas`)

    await db.end()
}

main().catch(e => { console.error(e.message); process.exit(1) })
