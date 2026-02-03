import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    const units = await prisma.unit.findMany({ select: { id: true, name: true, consecutiveSeed: true } })

    for (const unit of units) {
        if (!unit.name.includes('Ciudad Jardin')) continue;

        console.log(`\nAll Internal Payments for unit ${unit.name} (${unit.id}):`)
        console.log(`Unit Seed: ${unit.consecutiveSeed}`)

        const payments = await prisma.payment.findMany({
            where: { unitId: unit.id, sourceType: 'INTERNAL' },
            orderBy: [{ paymentDate: 'asc' }, { createdAt: 'asc' }],
            select: { consecutiveNumber: true, paymentDate: true, createdAt: true, monthlyReportId: true }
        })

        const display = payments.map((p, i) => {
            const dateStr = p.paymentDate.toISOString().split('T')[0]
            const timeStr = p.paymentDate.toISOString().split('T')[1].split('.')[0]
            const gap = i > 0 && (p.consecutiveNumber || 0) !== (payments[i - 1].consecutiveNumber || 0) + 1 ? 'GAP!' : ''
            return {
                num: p.consecutiveNumber,
                date: dateStr,
                created: timeStr,
                gap,
                frozen: !!p.monthlyReportId
            }
        })

        console.table(display)
    }
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
