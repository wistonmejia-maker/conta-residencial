import prisma from './prisma'

/**
 * Calculates the current status and balance of an invoice based on:
 * 1. its total amount
 * 2. applied payments
 * 3. applied credit notes
 * 4. expected retentions (retefuente and reteica)
 * 
 * An invoice is considered PAID if (Payments + Credit Notes) >= (Total Amount - Retentions)
 */
export async function calculateInvoiceStatus(invoiceId: string) {
    const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: {
            paymentItems: true,
            creditNotes: true,
        },
    })

    if (!invoice) {
        throw new Error('Invoice not found')
    }

    // Sum of all payments applied
    const totalPaid = invoice.paymentItems.reduce(
        (sum, item) => sum + Number(item.amountApplied),
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

/**
 * Updates an invoice status in the database using the centralized logic
 */
export async function updateInvoiceStatus(invoiceId: string, tx?: any) {
    const { status } = await calculateInvoiceStatus(invoiceId)

    const db = tx || prisma
    return await db.invoice.update({
        where: { id: invoiceId },
        data: { status }
    })
}
