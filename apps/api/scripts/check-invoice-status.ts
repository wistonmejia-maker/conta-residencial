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
    const invoices = await prisma.invoice.findMany({
        where: {
            status: { not: 'PAID' }
        },
        include: {
            provider: true,
            unit: true,
            paymentItems: { include: { payment: true } },
            creditNotes: true
        }
    })

    let count = 0;
    for (const inv of invoices) {
        const calc = await calculateInvoiceStatus(inv.id)
        if (calc.balance === 0 || calc.status === 'PAID') {
            console.log(`Invoice ${inv.invoiceNumber} (${inv.provider.name}) in ${inv.unit.name}`)
            console.log(`  Current Status: ${inv.status}`)
            console.log(`  Calculated Status: ${calc.status}`)
            console.log(`  Total Amount: ${inv.totalAmount}`)
            console.log(`  Total Paid: ${calc.totalPaid}`)
            console.log(`  Retentions: Fte: ${inv.retefuenteAmount}, ICA: ${inv.reteicaAmount}`)
            console.log(`  Balance: ${calc.balance}`)
            console.log(`  Expected Net: ${calc.netThreshold}`)
            count++;
        }
    }

    console.log(`\nFound ${count} invoices with mismatched statuses.`)
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect())
