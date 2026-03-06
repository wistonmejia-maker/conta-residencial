const { Client } = require('pg')
const db = new Client({ connectionString: process.env.DATABASE_URL })
db.connect()
    .then(() => db.query(`
    SELECT id, name, nit, dv, tax_type, email, phone, bank_name, bank_account, category, status,
           (SELECT COUNT(*) FROM invoices WHERE provider_id = providers.id) AS facturas
    FROM providers
    WHERE name ILIKE '%guzman%' OR name ILIKE '%julio%cesar%'
    ORDER BY name
  `))
    .then(r => {
        if (r.rows.length === 0) { console.log('No encontrado'); db.end(); return }
        r.rows.forEach(p => {
            console.log(`\n📋 ${p.name}`)
            console.log(`   NIT:      ${p.nit}-${p.dv}`)
            console.log(`   Tipo:     ${p.tax_type}`)
            console.log(`   Email:    ${p.email || '—'}`)
            console.log(`   Teléfono: ${p.phone || '—'}`)
            console.log(`   Banco:    ${p.bank_name || '—'}`)
            console.log(`   Cuenta:   ${p.bank_account || '—'}`)
            console.log(`   Categoría:${p.category || '—'}`)
            console.log(`   Estado:   ${p.status}`)
            console.log(`   Facturas: ${p.facturas}`)
            console.log(`   ID:       ${p.id}`)
        })
        db.end()
    })
    .catch(e => { console.error(e.message); db.end() })
