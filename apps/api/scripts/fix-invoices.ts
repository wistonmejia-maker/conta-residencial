import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function calculateInvoiceStatus(invoiceId: string) {
    const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: {
            paymentItems: {
                include: { payment: true }
            },
            creditNotes: true,
        },
    })

    if (!invoice) {
        throw new Error('Invoice not found')
    }

    // Sum of all payments applied (excluding VOIDED ones)
    const totalPaid = invoice.paymentItems.reduce(
        (sum, item) => {
            if (item.payment?.status === 'VOIDED') return sum
            return sum + Number(item.amountApplied)
        },
        0
    )

    // Sum of all credit notes applied
    const totalAdjusted = invoice.creditNotes.reduce(
        (sum, cn) => sum + Number(cn.totalAmount),
        0
    )

    const grossAmount = Number(invoice.totalAmount)
    const retefuente = Number(invoice.retefuenteAmount || 0)
    const reteica = Number(invoice.reteicaAmount || 0)

    // The amount that actually needs to be paid in cash/transfer
    const netThreshold = grossAmount - retefuente - reteica

    // Total settled = Payments + Credit Notes
    const totalSettled = totalPaid + totalAdjusted

    // Current Balance for the user (Gross - Paid - Adjusted - Retentions)
    const balance = Math.max(0, netThreshold - totalPaid - totalAdjusted)

    let status = 'PENDING'
    if (totalSettled >= netThreshold) {
        status = 'PAID'
    } else if (totalSettled > 0) {
        status = 'PARTIALLY_PAID'
    }

    return {
        status,
        totalPaid,
        totalAdjusted,
        balance,
        netThreshold
    }
}

async function main() {
    const isExecute = process.argv.includes('--execute')
    console.log(isExecute ? "RUNNING IN EXECUTE MODE - Changes will be saved." : "DRY RUN MODE - No changes will be saved to the database. Use --execute to apply.")

    const invoices = await prisma.invoice.findMany({
        where: {
            status: { not: 'PAID' }
        },
        include: {
            paymentItems: { include: { payment: true } },
            creditNotes: true
        }
    })

    let count = 0;
    for (const inv of invoices) {
        const calc = await calculateInvoiceStatus(inv.id)
        if (inv.status !== calc.status) {
            if (isExecute) {
                await prisma.invoice.update({
                    where: { id: inv.id },
                    data: { status: calc.status }
                })
                console.log(`[EXECUTED] Fixed invoice ${inv.invoiceNumber} -> ${calc.status}`)
            } else {
                console.log(`[DRY RUN] Would fix invoice ${inv.invoiceNumber}: ${inv.status} -> ${calc.status}`)
            }
            count++;
        }
    }
    console.log(`Total needing fixes: ${count}`)
}

main().finally(() => prisma.$disconnect())
