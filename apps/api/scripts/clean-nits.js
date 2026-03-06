// clean-nits.js - Limpia los NITs sucios en la tabla providers de Neon
// Estrategia:
//   1. Para cada proveedor, extrae solo dígitos del campo nit (quita puntos, comas, espacios y el sufijo -DV)
//   2. Recalcula el DV correcto usando el algoritmo Módulo 11
//   3. Si el NIT limpio ya existe en otro registro → marca el sucio para revisión manual
//   4. Elimina el registro basura "CO,BANCO DE OCCIDENTE..." con NIT 879
//
// Uso: node scripts/clean-nits.js

const { Client } = require('pg')

function calcularDV(nit) {
    const n = nit.replace(/[^0-9]/g, '')
    const primos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71]
    let suma = 0
    for (let i = 0; i < n.length; i++) {
        suma += parseInt(n[n.length - 1 - i]) * primos[i]
    }
    const r = suma % 11
    return String(r === 0 || r === 1 ? r : 11 - r)
}

// Extrae el NIT limpio de un campo que puede tener puntos, comas, guiones y DV embebido
function extractNit(raw) {
    if (!raw) return null
    // Remove dots and commas (thousand separators)
    let s = raw.replace(/\./g, '').replace(/,/g, '')
    // If contains "-", strip the DV suffix
    const dash = s.lastIndexOf('-')
    if (dash > 0) s = s.slice(0, dash)
    // Keep only digits
    s = s.replace(/[^0-9]/g, '')
    return s || null
}

async function main() {
    const db = new Client({ connectionString: process.env.DATABASE_URL })
    await db.connect()
    console.log('🔗 Conectado a Neon\n')

    const { rows: all } = await db.query('SELECT id, name, nit, dv FROM providers ORDER BY created_at ASC')
    console.log(`📋 Total proveedores: ${all.length}\n`)

    const stats = { fixed: 0, skipped_duplicate: 0, deleted: 0, already_clean: 0 }

    // Build a map of clean-nit → id for conflict detection
    const cleanNitMap = new Map()
    for (const p of all) {
        const clean = extractNit(p.nit)
        if (clean && /^[0-9]+$/.test(p.nit) && clean === p.nit) {
            // Already clean NITs go into the map first
            cleanNitMap.set(clean, p.id)
        }
    }

    for (const p of all) {
        const cleanNit = extractNit(p.nit)

        // Already clean?
        if (cleanNit && /^[0-9]+$/.test(p.nit) && cleanNit === p.nit && p.nit.length >= 5) {
            stats.already_clean++
            continue
        }

        // Garbage record created by CSV parse error
        if (p.nit === '879' || p.nit.length < 4) {
            console.log(`  🗑️  Eliminando registro basura: "${p.name}" (NIT: ${p.nit})`)
            await db.query('DELETE FROM providers WHERE id = $1', [p.id])
            stats.deleted++
            continue
        }

        if (!cleanNit || cleanNit.length < 4) {
            console.log(`  ⚠️  No se pudo limpiar "${p.name}" (NIT raw: ${p.nit}) — se omite`)
            stats.skipped_duplicate++
            continue
        }

        const correctDv = calcularDV(cleanNit)

        // Check if the clean NIT already exists in another record
        if (cleanNitMap.has(cleanNit) && cleanNitMap.get(cleanNit) !== p.id) {
            const existingId = cleanNitMap.get(cleanNit)

            // Check which one has invoices
            const invDirty = await db.query('SELECT COUNT(*) FROM invoices WHERE provider_id = $1', [p.id])
            const invClean = await db.query('SELECT COUNT(*) FROM invoices WHERE provider_id = $1', [existingId])
            const dirtyHasInvoices = parseInt(invDirty.rows[0].count) > 0
            const cleanHasInvoices = parseInt(invClean.rows[0].count) > 0

            if (!dirtyHasInvoices) {
                // Safe to delete the dirty duplicate
                console.log(`  ⚡ DUPLICADO: "${p.name}" (${p.nit}) → ${cleanNit} ya existe. Eliminando el sucio sin facturas.`)
                await db.query('DELETE FROM providers WHERE id = $1', [p.id])
                stats.deleted++
            } else if (!cleanHasInvoices) {
                // Delete the clean one (no invoices) and update this one
                console.log(`  ⚡ DUPLICADO: "${p.name}" (${p.nit}) tiene facturas. Eliminando el otro sin facturas y limpiando este.`)
                await db.query('DELETE FROM providers WHERE id = $1', [existingId])
                cleanNitMap.set(cleanNit, p.id)
                await db.query('UPDATE providers SET nit = $1, dv = $2, updated_at = NOW() WHERE id = $3', [cleanNit, correctDv, p.id])
                stats.fixed++
            } else {
                // Both have invoices — just clean without deleting
                console.log(`  ⚠️  DUPLICADO con facturas ambos: "${p.name}" (${p.nit}). Solo limpiando NIT sin eliminar.`)
                try {
                    await db.query('UPDATE providers SET nit = $1, dv = $2, updated_at = NOW() WHERE id = $3', [cleanNit + '_dup', correctDv, p.id])
                    stats.fixed++
                } catch (err) {
                    console.log(`     → No se pudo actualizar: ${err.message}`)
                    stats.skipped_duplicate++
                }
            }
            continue
        }

        // Update to clean NIT
        try {
            await db.query(
                'UPDATE providers SET nit = $1, dv = $2, updated_at = NOW() WHERE id = $3',
                [cleanNit, correctDv, p.id]
            )
            cleanNitMap.set(cleanNit, p.id)
            console.log(`  ✅ "${p.name}"  ${p.nit.padEnd(20)} → NIT: ${cleanNit}  DV: ${correctDv}`)
            stats.fixed++
        } catch (err) {
            if (err.code === '23505') {
                // Unique constraint: another row already has this NIT
                console.log(`  ⚡ DUPLICADO (DB constraint): "${p.name}" NIT ${cleanNit} — eliminando`)
                await db.query('DELETE FROM providers WHERE id = $1', [p.id])
                stats.deleted++
            } else {
                console.error(`  ❌ Error en "${p.name}": ${err.message}`)
            }
        }
    }

    await db.end()

    console.log('\n================================')
    console.log(`✅ NITs limpiados:      ${stats.fixed}`)
    console.log(`☑️  Ya estaban limpios: ${stats.already_clean}`)
    console.log(`🗑️  Eliminados:         ${stats.deleted}`)
    console.log(`⚠️  Omitidos:           ${stats.skipped_duplicate}`)
    console.log('================================')
}

main().catch(e => { console.error(e.message); process.exit(1) })
