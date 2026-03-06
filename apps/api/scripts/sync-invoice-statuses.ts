import prisma from '../src/lib/prisma'
import { updateInvoiceStatus } from '../src/lib/invoice-utils'

async function syncAllInvoices() {
    console.log('Starting invoice status synchronization...')

    try {
        const invoices = await prisma.invoice.findMany({
            select: { id: true, invoiceNumber: true }
        })

        console.log(`Found ${invoices.length} invoices to process.`)

        let updatedCount = 0
        for (const inv of invoices) {
            try {
                await updateInvoiceStatus(inv.id)
                updatedCount++
                if (updatedCount % 10 === 0) {
                    console.log(`Processed ${updatedCount}/${invoices.length}...`)
                }
            } catch (err) {
                console.error(`Error updating invoice ${inv.invoiceNumber} (${inv.id}):`, err)
            }
        }

        console.log('Synchronization complete!')
        console.log(`Successfully updated ${updatedCount} invoices.`)
    } catch (err) {
        console.error('Fatal error during sync:', err)
    } finally {
        await prisma.$disconnect()
    }
}

syncAllInvoices()
