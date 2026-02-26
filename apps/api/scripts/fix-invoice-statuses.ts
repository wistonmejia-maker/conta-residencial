/**
 * fix-invoice-statuses.ts
 * 
 * Corrección masiva: recalcula el estado de todas las facturas que 
 * tienen pagos asociados pero quedaron en PENDING o PARTIALLY_PAID 
 * por el bug donde el upload del soporte no actualizaba el estado.
 * 
 * Uso: npx ts-node scripts/fix-invoice-statuses.ts
 */

import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'

dotenv.config()

const prisma = new PrismaClient()

async function fixInvoiceStatuses() {
    console.log('🔍 Buscando facturas con pagos asociados cuyo estado podría ser incorrecto...\n')

    // Buscar todas las facturas que tienen paymentItems
    const invoicesWithPayments = await prisma.invoice.findMany({
        where: {
            paymentItems: {
                some: {}
            }
        },
        include: {
            paymentItems: true,
            creditNotes: true
        }
    })

    console.log(`📋 Total facturas con pagos: ${invoicesWithPayments.length}\n`)

    let fixed = 0
    let alreadyCorrect = 0

    for (const invoice of invoicesWithPayments) {
        const paymentsPaid = invoice.paymentItems.reduce((sum, pi) => sum + Number(pi.amountApplied), 0)
        const creditNotesTotal = invoice.creditNotes.reduce((sum, cn) => sum + Number(cn.totalAmount), 0)
        const totalPaid = paymentsPaid + creditNotesTotal
        const totalAmount = Number(invoice.totalAmount)

        let correctStatus = 'PENDING'
        if (totalPaid >= totalAmount) {
            correctStatus = 'PAID'
        } else if (totalPaid > 0) {
            correctStatus = 'PARTIALLY_PAID'
        }

        if (invoice.status !== correctStatus) {
            await prisma.invoice.update({
                where: { id: invoice.id },
                data: { status: correctStatus }
            })
            console.log(`✅ Factura ${invoice.invoiceNumber}: ${invoice.status} → ${correctStatus} (pagado: $${totalPaid.toLocaleString()} / total: $${totalAmount.toLocaleString()})`)
            fixed++
        } else {
            alreadyCorrect++
        }
    }

    console.log('\n─────────────────────────────────────────')
    console.log(`✅ Facturas corregidas:    ${fixed}`)
    console.log(`✔️  Ya estaban correctas:  ${alreadyCorrect}`)
    console.log('─────────────────────────────────────────')
    console.log('\n🎉 Corrección completada.')
}

fixInvoiceStatuses()
    .catch((e) => {
        console.error('❌ Error en corrección:', e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
