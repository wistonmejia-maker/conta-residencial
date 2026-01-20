
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    const units = await prisma.unit.findMany()
    if (units.length === 0) {
        console.log('No units found.')
        return
    }

    for (const unit of units) {
        console.log(`\nChecking invoices for unit: ${unit.name} (${unit.id})`)
        const invoices = await prisma.invoice.findMany({
            where: { unitId: unit.id },
            include: { provider: true }
        })

        if (invoices.length === 0) {
            console.log('  No invoices found.')
            continue
        }

        const byStatus = invoices.reduce((acc: any, inv) => {
            acc[inv.status] = (acc[inv.status] || 0) + 1
            return acc
        }, {})
        console.log('  Invoices by status:', byStatus)

        const overdue = invoices.filter(i => i.status === 'OVERDUE')
        if (overdue.length > 0) {
            console.log(`  Found ${overdue.length} OVERDUE invoices (User logic bug suspected here)`)
        }
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect())
