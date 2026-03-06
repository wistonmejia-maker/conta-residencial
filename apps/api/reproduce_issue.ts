import { PrismaClient } from '@prisma/client'
import { resequencePaymentConsecutives } from './src/routes/payments'

const prisma = new PrismaClient()

async function main() {
    console.log('Starting reproduction...')
    // 1. Create a Unit
    const unit = await prisma.unit.create({
        data: {
            name: 'Test Unit Consecutives',
            taxId: '999999999-9',
            consecutiveSeed: 100
        }
    })
    console.log('Unit created:', unit.id)

    try {
        // 2. Create payments 1 and 2
        await prisma.payment.create({
            data: { unitId: unit.id, consecutiveNumber: 1, paymentDate: new Date('2023-01-01'), sourceType: 'INTERNAL', amountPaid: 1000, netValue: 1000 }
        })
        await prisma.payment.create({
            data: { unitId: unit.id, consecutiveNumber: 2, paymentDate: new Date('2023-01-02'), sourceType: 'INTERNAL', amountPaid: 1000, netValue: 1000 }
        })
        console.log('Payments created: 1, 2')

        // 3. Update unit seed to 2. This should trigger resequence logic to shift P1 -> 2, P2 -> 3.
        // P1(1) -> 2. BUT P2 is already 2.
        // If there is a unique constraint, this will fail.

        await prisma.unit.update({
            where: { id: unit.id },
            data: { consecutiveSeed: 2 }
        })
        console.log('Unit seed updated to 2')

        console.log('Running resequencePaymentConsecutives...')
        await resequencePaymentConsecutives(unit.id)
        console.log('Resequence SUCCESS (No Unique Constraint?)')

        // check final values
        const payments = await prisma.payment.findMany({ where: { unitId: unit.id }, orderBy: { consecutiveNumber: 'asc' } })
        console.log('Final payments:', payments.map(p => p.consecutiveNumber))

    } catch (e: any) {
        console.error('Resequence FAILED:', e.message)
    } finally {
        // Cleanup
        await prisma.payment.deleteMany({ where: { unitId: unit.id } })
        await prisma.unit.delete({ where: { id: unit.id } })
        await prisma.$disconnect()
    }
}

main()
