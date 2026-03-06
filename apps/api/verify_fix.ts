import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    const unitName = 'Centro Comercial Ciudad Jardin' // From content
    console.log(`Searching for unit: ${unitName}`)

    // Find unit
    const unit = await prisma.unit.findFirst({
        where: { name: { contains: 'Ciudad Jardin', mode: 'insensitive' } }
    })

    if (!unit) {
        console.error('Unit not found!')
        return
    }

    console.log(`Found Unit: ${unit.name} (${unit.id})`)
    console.log(`Current consecutiveSeed: ${unit.consecutiveSeed}`)

    // Find payments
    const payments = await prisma.payment.findMany({
        where: {
            unitId: unit.id,
            sourceType: 'INTERNAL'
        },
        orderBy: { consecutiveNumber: 'asc' }
    })

    console.log(`Found ${payments.length} internal payments.`)
    if (payments.length > 0) {
        console.log(`First Payment: #${payments[0].consecutiveNumber}`)
        console.log(`Last Payment: #${payments[payments.length - 1].consecutiveNumber}`)
        console.log(`Expected Next Seed (Last + 1): ${payments[payments.length - 1].consecutiveNumber! + 1}`)
    } else {
        console.log('No internal payments found.')
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect())
