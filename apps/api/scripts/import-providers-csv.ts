/**
 * Script: import-providers-csv.ts
 * Importa los proveedores desde el CSV "Proveedores LC.csv" a la DB de Neon.
 * Uso: npx ts-node scripts/import-providers-csv.ts
 */

import * as fs from 'fs'
import { PrismaClient } from '@prisma/client'


const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL } }
})

// --- Helpers ---

function cleanNit(raw: string): { nit: string; dv: string } {
    if (!raw) return { nit: '', dv: '' }
    // Remove "CC:", spaces, dots and split on '-'
    const cleaned = raw.replace(/CC:\s*/i, '').replace(/\s/g, '').replace(/\./g, '')
    const dashIdx = cleaned.lastIndexOf('-')
    if (dashIdx > 0) {
        return {
            nit: cleaned.slice(0, dashIdx).replace(/[^0-9]/g, ''),
            dv: cleaned.slice(dashIdx + 1).replace(/[^0-9]/g, '')
        }
    }
    return { nit: cleaned.replace(/[^0-9]/g, ''), dv: '' }
}

function calcularDV(nit: string): string {
    const nitLimpio = nit.replace(/[^0-9]/g, '')
    const primos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71]
    let suma = 0
    for (let i = 0; i < nitLimpio.length; i++) {
        suma += parseInt(nitLimpio[nitLimpio.length - 1 - i]) * primos[i]
    }
    const residuo = suma % 11
    if (residuo === 0 || residuo === 1) return residuo.toString()
    return (11 - residuo).toString()
}

function cleanTipo(tipo: string): string {
    if (!tipo) return 'Corriente'
    const t = tipo.trim().toLowerCase()
    if (t === 'ahorro' || t === 'ahorros') return 'AHORROS'
    if (t === 'corriente') return 'CORRIENTE'
    return tipo.trim()
}

function mapCategory(servicio: string): string {
    if (!servicio) return ''
    const s = servicio.toUpperCase().trim()
    if (s.includes('PUBLICO') || s.includes('EMCALI') || s.includes('ACUASER') || s.includes('CLARO') || s.includes('MOVISTAR')) return 'servicios_publicos'
    if (s.includes('ASEO') || s.includes('LIMPIEZA')) return 'aseo'
    if (s.includes('SEGURIDAD') || s.includes('CAMARAS') || s.includes('VIGILANCIA')) return 'seguridad'
    if (s.includes('MANTENIMIENTO') || s.includes('ELECTRICIDAD') || s.includes('CERRAJERIA') || s.includes('ASCENSOR')) return 'mantenimiento'
    if (s.includes('IMPUESTO') || s.includes('CONTADOR') || s.includes('CONTABILIDAD')) return 'legales'
    if (s.includes('SEGURO')) return 'seguros'
    if (s.includes('INSUMO') || s.includes('PAPELERIA') || s.includes('FERRETERIA')) return 'insumos'
    return 'otro'
}

function parseCSVLine(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (char === '"' && !inQuotes) {
            inQuotes = true
        } else if (char === '"' && inQuotes) {
            inQuotes = false
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim())
            current = ''
        } else {
            current += char
        }
    }
    result.push(current.trim())
    return result
}

async function main() {
    const csvPath = 'C:\\Users\\MejIA\\Documents\\Proyectos Saas MejIA\\conta_residencial_repo\\docs\\Proveedores LC.csv'

    const content = fs.readFileSync(csvPath, 'utf-8')

    // Normalize line endings and split
    const rawLines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    // Join lines that are part of multiline quoted fields
    const fixedContent = rawLines.replace(/"[^"]*\n[^"]*"/g, (match) => match.replace(/\n/g, ' '))
    const lines = fixedContent.split('\n').filter(l => l.trim())

    const header = parseCSVLine(lines[0])
    console.log('📋 Columnas detectadas:', header)

    const results = { created: 0, skipped: 0, errors: [] as string[] }

    for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i])
        if (cols.every(c => !c)) continue // skip empty rows

        const nombre = cols[0] || ''
        const empresa = cols[1] || ''
        const nitRaw = cols[2] || ''
        const direccion = cols[3] || ''
        const banco = cols[4] || ''
        const tipoCuenta = cols[5] || ''
        const numCuenta = cols[6] || ''
        const contacto = cols[7] || ''
        const celular = cols[8] || ''
        const correo = cols[9] || ''
        const servicio = cols[10] || ''

        if (!nombre) {
            console.log(`  ⏭️  Fila ${i + 1}: sin nombre, se omite`)
            results.skipped++
            continue
        }

        const { nit, dv } = cleanNit(nitRaw)

        if (!nit) {
            console.log(`  ⚠️  "${nombre}" sin NIT — se omite`)
            results.skipped++
            continue
        }

        // Calculate DV if not provided
        const finalDv = dv || calcularDV(nit)

        // Clean bank account (remove commas used as thousands separator)
        const cleanBankAccount = numCuenta.replace(/,/g, '').replace(/\s/g, '')

        // Determine taxType based on NIT length
        let taxType = 'NIT'
        if (nit.length <= 8) taxType = 'CC' // cedula de ciudadanía
        if (nit.length === 9 || nombre.includes('SAS') || nombre.includes('S.A') || nombre.includes('LTDA') || empresa) {
            taxType = 'NIT'
        }

        try {
            await prisma.provider.upsert({
                where: { nit },
                update: {
                    // On conflict, update contact info if missing
                    email: correo || undefined,
                    phone: celular || undefined,
                    city: 'Cali',
                },
                create: {
                    name: nombre,
                    taxType,
                    nit,
                    dv: finalDv,
                    email: correo || undefined,
                    phone: celular || undefined,
                    address: direccion || undefined,
                    city: 'Cali',
                    bankName: banco || undefined,
                    bankAccount: cleanBankAccount || undefined,
                    accountType: cleanTipo(tipoCuenta) || undefined,
                    category: mapCategory(servicio),
                    status: 'ACTIVE',
                    defaultRetefuentePerc: 0,
                    defaultReteicaPerc: 0,
                }
            })
            console.log(`  ✅ "${nombre}" (NIT: ${nit}-${finalDv})`)
            results.created++
        } catch (err: any) {
            const msg = `ERROR en "${nombre}" (NIT: ${nit}): ${err.message}`
            console.error(`  ❌ ${msg}`)
            results.errors.push(msg)
        }
    }

    console.log('\n=============================')
    console.log(`✅ Creados/actualizados: ${results.created}`)
    console.log(`⏭️  Omitidos (sin NIT):  ${results.skipped}`)
    console.log(`❌ Errores:              ${results.errors.length}`)
    if (results.errors.length > 0) {
        console.log('\nDetalle de errores:')
        results.errors.forEach(e => console.log(' -', e))
    }
    console.log('=============================')
}

main()
    .catch(e => { console.error(e); process.exit(1) })
    .finally(() => prisma.$disconnect())
