// import-providers-csv.js - Importa Proveedores LC.csv a Neon DB
// Uso: node scripts/import-providers-csv.js

const fs = require('fs')
const { Client } = require('pg')

const CSV_PATH = 'C:\\Users\\MejIA\\Documents\\Proyectos Saas MejIA\\conta_residencial_repo\\docs\\Proveedores LC.csv'

// Algoritmo Módulo 11 para DV del NIT colombiano
function calcularDV(nit) {
    const nitLimpio = nit.replace(/[^0-9]/g, '')
    const primos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71]
    let suma = 0
    for (let i = 0; i < nitLimpio.length; i++) {
        suma += parseInt(nitLimpio[nitLimpio.length - 1 - i]) * primos[i]
    }
    const residuo = suma % 11
    if (residuo === 0 || residuo === 1) return String(residuo)
    return String(11 - residuo)
}

function cleanNit(raw) {
    if (!raw) return { nit: '', dv: '' }
    // Remove "CC:", spaces and dots, then split on '-'
    const s = raw.replace(/CC:\s*/i, '').replace(/\s/g, '').replace(/\./g, '')
    const dash = s.lastIndexOf('-')
    if (dash > 0) {
        return {
            nit: s.slice(0, dash).replace(/[^0-9]/g, ''),
            dv: s.slice(dash + 1).replace(/[^0-9]/g, '')
        }
    }
    return { nit: s.replace(/[^0-9]/g, ''), dv: '' }
}

function mapCategory(servicio) {
    if (!servicio) return 'otro'
    const s = servicio.toUpperCase()
    if (s.includes('PUBLICO') || s.includes('EMCALI') || s.includes('CLARO') || s.includes('MOVISTAR') || s.includes('ACUASER')) return 'servicios_publicos'
    if (s.includes('ASEO')) return 'aseo'
    if (s.includes('SEGURIDAD') || s.includes('CAMARA') || s.includes('VIGILANCIA')) return 'seguridad'
    if (s.includes('MANTEN') || s.includes('ELECTRIC') || s.includes('CERRAJERIA') || s.includes('ASCENSOR') || s.includes('PISCINA')) return 'mantenimiento'
    if (s.includes('IMPUESTO') || s.includes('CONTADOR') || s.includes('CONTAB')) return 'legales'
    if (s.includes('SEGURO')) return 'seguros'
    if (s.includes('INSUMO') || s.includes('PAPELERIA') || s.includes('FERRETER')) return 'insumos'
    return 'otro'
}

function cleanTipoCuenta(tipo) {
    if (!tipo) return null
    const t = tipo.trim().toLowerCase()
    if (t === 'ahorro' || t === 'ahorros') return 'AHORROS'
    if (t === 'corriente') return 'CORRIENTE'
    return tipo.trim().toUpperCase() || null
}

// Parse a CSV line respecting quoted fields
function parseLine(line) {
    const result = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
        const c = line[i]
        if (c === '"') {
            inQuotes = !inQuotes
        } else if (c === ',' && !inQuotes) {
            result.push(current.trim())
            current = ''
        } else {
            current += c
        }
    }
    result.push(current.trim())
    return result
}

async function main() {
    // Read CSV with BOM handling
    let content = fs.readFileSync(CSV_PATH, 'utf8')
    if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1) // strip BOM

    // Split on CRLF (Windows) or LF
    const lines = content.split(/\r\n|\r|\n/).filter(l => l.trim())
    console.log(`📄 Total líneas (sin header): ${lines.length - 1}`)

    const db = new Client({
        connectionString: process.env.DATABASE_URL
    })

    await db.connect()
    console.log('🔗 Conectado a Neon\n')

    const stats = { created: 0, updated: 0, skipped: 0, errors: [] }

    for (let i = 1; i < lines.length; i++) {
        const cols = parseLine(lines[i])
        const nombre = (cols[0] || '').replace(/^"/, '').replace(/"$/, '').trim()
        const nitRaw = (cols[2] || '').trim()
        const direccion = (cols[3] || '').trim()
        const banco = (cols[4] || '').trim()
        const tipoCuenta = (cols[5] || '').trim()
        const numCuenta = (cols[6] || '').replace(/,/g, '').replace(/\s/g, '').trim()
        const celular = (cols[8] || '').trim()
        const correo = (cols[9] || '').trim()
        const servicio = (cols[10] || '').trim()

        if (!nombre) { stats.skipped++; continue }
        if (!nitRaw) {
            console.log(`  ⏭️  "${nombre}" — sin NIT, omitido`)
            stats.skipped++
            continue
        }

        const { nit, dv } = cleanNit(nitRaw)
        if (!nit) {
            console.log(`  ⏭️  "${nombre}" — NIT inválido (${nitRaw}), omitido`)
            stats.skipped++
            continue
        }

        const finalDv = dv || calcularDV(nit)
        const taxType = (nit.length >= 9) ? 'NIT' : 'CC'
        const category = mapCategory(servicio)
        const accountType = cleanTipoCuenta(tipoCuenta)

        try {
            // Check if NIT already exists
            const existing = await db.query('SELECT id FROM providers WHERE nit = $1', [nit])

            if (existing.rows.length > 0) {
                // Update only if data is missing
                await db.query(`
                    UPDATE providers SET
                        email = COALESCE(NULLIF(email,''), $1),
                        phone = COALESCE(NULLIF(phone,''), $2),
                        bank_name = COALESCE(NULLIF(bank_name,''), $3),
                        bank_account = COALESCE(NULLIF(bank_account,''), $4),
                        account_type = COALESCE(NULLIF(account_type,''), $5),
                        updated_at = NOW()
                    WHERE nit = $6
                `, [
                    correo || null,
                    celular || null,
                    banco || null,
                    numCuenta || null,
                    accountType,
                    nit
                ])
                console.log(`  🔄 "${nombre}" (NIT: ${nit}-${finalDv}) — actualizado`)
                stats.updated++
            } else {
                await db.query(`
                    INSERT INTO providers (
                        id, name, tax_type, nit, dv, email, phone,
                        address, city, bank_name, bank_account, account_type,
                        category, status,
                        default_retefuente_perc, default_reteica_perc,
                        is_recurring, created_at, updated_at
                    ) VALUES (
                        gen_random_uuid(), $1, $2, $3, $4, $5, $6,
                        $7, 'Cali', $8, $9, $10,
                        $11, 'ACTIVE',
                        0, 0,
                        false, NOW(), NOW()
                    )
                `, [
                    nombre,
                    taxType,
                    nit,
                    finalDv,
                    correo || null,
                    celular || null,
                    direccion || null,
                    banco || null,
                    numCuenta || null,
                    accountType,
                    category
                ])
                console.log(`  ✅ "${nombre}" (NIT: ${nit}-${finalDv})`)
                stats.created++
            }
        } catch (err) {
            const msg = `"${nombre}" (NIT: ${nit}): ${err.message}`
            console.error(`  ❌ ${msg}`)
            stats.errors.push(msg)
        }
    }

    await db.end()

    console.log('\n================================')
    console.log(`✅ Creados:      ${stats.created}`)
    console.log(`🔄 Actualizados: ${stats.updated}`)
    console.log(`⏭️  Omitidos:    ${stats.skipped}`)
    console.log(`❌ Errores:      ${stats.errors.length}`)
    if (stats.errors.length > 0) {
        console.log('\nDetalle errores:')
        stats.errors.forEach(e => console.log('  -', e))
    }
    console.log('================================')
}

main().catch(e => { console.error(e); process.exit(1) })
