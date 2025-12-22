import { PrismaClient } from '@prisma/client'

// Initialize Prisma
const prisma = new PrismaClient({
    datasources: {
        db: { url: process.env.DATABASE_URL }
    }
})

async function main() {
    console.log('🎭 Starting Commercial Demo Seed...')

    const DEMO_UNIT_NAME = 'Residencial Demo Comercial'
    const DEMO_UNIT_NIT = '900999999'

    // 1. Clean up existing Demo Unit (RESET)
    const existingUnit = await prisma.unit.findFirst({
        where: { taxId: DEMO_UNIT_NIT }
    })

    if (existingUnit) {
        console.log('🧹 Cleaning up previous demo data...')
        await prisma.invoice.deleteMany({ where: { unitId: existingUnit.id } })
        await prisma.providerUnitConfig.deleteMany({ where: { unitId: existingUnit.id } })
        await prisma.unit.delete({ where: { id: existingUnit.id } })
        console.log('✨ Previous demo unit removed.')
    }

    // 2. Create Fresh Demo Unit
    const unit = await prisma.unit.create({
        data: {
            name: DEMO_UNIT_NAME,
            taxId: DEMO_UNIT_NIT,
            address: 'Av. El Poblado #10-50, Medellín',
            logoUrl: 'https://res.cloudinary.com/demo/image/upload/v1699999999/building_icon.png'
        }
    })
    console.log(`🏢 Created Unit: ${unit.name}`)

    // 3. Create/Ensure Providers (Global)
    const providersData = [
        {
            name: 'EPM Empresas Públicas',
            nit: '890904996',
            dv: '1',
            taxType: 'Gran Contribuyente',
            category: 'SERVICES',
            email: 'factura@epm.com.co'
        },
        {
            name: 'Seguridad Atlas Ltda',
            nit: '800123456',
            dv: '3',
            taxType: 'Juridica',
            category: 'SECURITY',
            email: 'cobranzas@atlas.com.co'
        },
        {
            name: 'Aseo Total SAS',
            nit: '900654321',
            dv: '8',
            taxType: 'Juridica',
            category: 'CLEANING',
            email: 'facturacion@aseototal.com'
        },
        {
            name: 'Ascensores Schindler',
            nit: '860000000',
            dv: '1',
            taxType: 'Juridica',
            category: 'MAINTENANCE',
            email: 'servicios@schindler.com'
        },
        {
            name: 'Jardinero Don José',
            nit: '70000000',
            dv: '0',
            taxType: 'Natural',
            category: 'MAINTENANCE',
            email: 'jose.jardin@gmail.com'
        }
    ]

    const providers = []
    for (const p of providersData) {
        const provider = await prisma.provider.upsert({
            where: { nit: p.nit },
            update: {},
            create: p
        })
        providers.push(provider)

        // Link to Unit with Config
        // Removed unsupported fields ak/accountType, autoRetentions
        await prisma.providerUnitConfig.create({
            data: {
                unitId: unit.id,
                providerId: provider.id,
                isRecurring: true,
                category: p.category
            }
        })
    }
    console.log(`👥 Providers configured: ${providers.length}`)

    // 4. Generate Historical Data (Past 6 Months)
    const monthsBack = 6
    const today = new Date()

    let totalInvoices = 0

    for (let i = monthsBack; i >= 0; i--) {
        const date = new Date(today.getFullYear(), today.getMonth() - i, 1)
        const dueDate = new Date(date.getFullYear(), date.getMonth(), 15)
        const isCurrentMonth = i === 0

        // EPM (Monthly)
        await createInvoice(unit.id, providers[0].id, `EPM-${date.getMonth() + 1}${date.getFullYear()}`, date, dueDate,
            getRandomAmount(800000, 1200000), 'Energía y Acueducto', isCurrentMonth ? 'PENDING' : 'PAID')

        // Atlas (Monthly Fixed)
        await createInvoice(unit.id, providers[1].id, `ATLAS-${date.getMonth() + 1}${date.getFullYear()}`, date, dueDate,
            5800000, 'Servicio de Vigilancia 24/7', isCurrentMonth ? 'PENDING' : 'PAID')

        // Aseo (Monthly Fixed)
        await createInvoice(unit.id, providers[2].id, `ASEO-${date.getMonth() + 1}${date.getFullYear()}`, date, dueDate,
            3200000, 'Servicio de Aseo General', isCurrentMonth ? 'PENDING' : 'PAID')

        // Ascensores (Monthly)
        await createInvoice(unit.id, providers[3].id, `SCH-${date.getMonth() + 1}${date.getFullYear()}`, date, dueDate,
            450000, 'Mantenimiento Preventivo Ascensores', isCurrentMonth ? 'PENDING' : 'PAID')

        // Random Extra
        if (Math.random() > 0.3) {
            await createInvoice(unit.id, providers[4].id, `JAR-${date.getMonth() + 1}${date.getFullYear()}`, new Date(date.getFullYear(), date.getMonth(), 5), dueDate,
                150000, 'Mantenimiento Jardines Entrada', isCurrentMonth ? 'PENDING' : 'PAID')
        }

        totalInvoices += 5
    }

    console.log(`📄 Generated ~${totalInvoices} invoices across 6 months`)
    console.log('✅ Demo Environment Ready!')
    console.log(`👉 Unit: ${DEMO_UNIT_NAME}`)
}

async function createInvoice(unitId: string, providerId: string, number: string, date: Date, due: Date, amount: number, desc: string, status: 'PENDING' | 'PAID') {
    return prisma.invoice.create({
        data: {
            unitId,
            providerId,
            invoiceNumber: number,
            invoiceDate: date,
            dueDate: due,
            subtotal: amount,
            taxIva: 0,
            totalAmount: amount,
            description: desc,
            status: status
        }
    })
}

function getRandomAmount(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min
}

main()
    .catch((e) => {
        console.error(e)
        // Ensure process is available.
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
