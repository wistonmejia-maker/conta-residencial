import { PrismaClient } from '@prisma/client'
import { resequencePaymentConsecutives } from './src/routes/payments'
import { unitSchema } from './src/schemas/unit.schema'

const prisma = new PrismaClient()

async function main() {
    console.log('Starting reproduction specific flow...')
    const unit = await prisma.unit.create({
        data: {
            name: 'Bug Repro Unit',
            taxId: '800123123-1',
            consecutiveSeed: 880,
            gmailScanStartDate: null // initially null
        }
    })
    console.log('Unit created:', unit.id)

    try {
        // Create 3 payments
        const paymentsData = [
            { consecutiveNumber: 880, paymentDate: new Date('2024-01-01') },
            { consecutiveNumber: 881, paymentDate: new Date('2024-01-02') },
            { consecutiveNumber: 882, paymentDate: new Date('2024-01-03') } // gap
        ]

        for (const p of paymentsData) {
            await prisma.payment.create({
                data: {
                    unitId: unit.id,
                    consecutiveNumber: p.consecutiveNumber,
                    paymentDate: p.paymentDate,
                    sourceType: 'INTERNAL',
                    amountPaid: 50000,
                    netValue: 50000
                }
            })
        }
        console.log('Payments created.')

        // SIMULATE FRONTEND REQUEST
        // The user changes seed to 887.
        // Also sends generic fields including empty string for gmailScanStartDate
        const rawBody = {
            name: 'Bug Repro Unit',
            taxId: '800123123-1',
            consecutiveSeed: 887,
            gmailScanStartDate: '' // This might be the issue if not handled in route logic exactly as we think
        }

        console.log('Simulating PUT /units/:id with body:', rawBody)

        // --- Logic from units.ts PUT /:id ---

        const validated = unitSchema.partial().safeParse(rawBody)
        if (!validated.success) {
            console.error('Validation Error:', validated.error.issues)
            throw new Error('Validation Failed')
        }

        const data = validated.data
        const seedChanged = data.consecutiveSeed !== undefined

        const unitData: any = { ...data }
        // Ensure this logic matches units.ts exactly
        if (data.gmailScanStartDate !== undefined) {
            // TS compiler in units.ts probably treats empty string as falsy
            unitData.gmailScanStartDate = data.gmailScanStartDate ? new Date(data.gmailScanStartDate) : null
        }

        console.log('Prisma Update Payload:', unitData)

        // 1. Update Unit
        await prisma.unit.update({
            where: { id: unit.id },
            data: unitData
        })
        console.log('Unit updated successfully.')

        // 2. Resequence
        if (seedChanged) {
            console.log('Seed changed, resequencing...')
            await resequencePaymentConsecutives(unit.id)
            console.log('Resequence success.')
        }

        // Check verification
        const finalUnit = await prisma.unit.findUnique({ where: { id: unit.id } })
        console.log('Final Unit Seed:', finalUnit?.consecutiveSeed)

        const finalPayments = await prisma.payment.findMany({ where: { unitId: unit.id }, orderBy: { consecutiveNumber: 'asc' } })
        console.log('Final Payments:', finalPayments.map(p => p.consecutiveNumber))

    } catch (e: any) {
        console.error('CRASHED:')
        console.error(e)
    } finally {
        await prisma.payment.deleteMany({ where: { unitId: unit.id } })
        await prisma.unit.delete({ where: { id: unit.id } })
        await prisma.$disconnect()
    }
}

main()
