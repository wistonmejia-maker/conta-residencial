import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('🌱 Starting seed...')

    // 1. Create Unit
    let unit = await prisma.unit.findFirst()
    if (!unit) {
        unit = await prisma.unit.create({
            data: {
                name: 'Edificio Altos del Poblado',
                taxId: '900123456',
                address: 'Calle 10 #43-12, Medellín'
            }
        })
        console.log(`Created unit: ${unit.name}`)
    } else {
        console.log(`Using existing unit: ${unit.name}`)
    }

    // 2. Create Providers
    const providersData: any[] = [
        {
            name: 'EPM Empresas Publicas de Medellin',
            nit: '890904996',
            dv: '1',
            taxType: 'Juridica',
            defaultRetefuentePerc: 0,
            defaultReteicaPerc: 0,
        },
        {
            name: 'Seguridad Atlas Ltda',
            nit: '800123456',
            dv: '3',
            taxType: 'Juridica',
            defaultRetefuentePerc: 2,
            defaultReteicaPerc: 0.5,
        },
        {
            name: 'Aseo Total SAS',
            nit: '900654321',
            dv: '8',
            taxType: 'Juridica',
            defaultRetefuentePerc: 1,
            defaultReteicaPerc: 0.5,
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
        console.log(`Provider ready: ${provider.name}`)
    }

    // 3. Create Invoices for EPM
    const epm = providers.find(p => p.nit === '890904996')
    if (epm) {
        await prisma.invoice.createMany({
            data: [
                {
                    unitId: unit.id,
                    providerId: epm.id,
                    invoiceNumber: 'EPM-001',
                    invoiceDate: new Date('2025-01-01'),
                    dueDate: new Date('2025-01-15'),
                    subtotal: 1000000,
                    taxIva: 0,
                    totalAmount: 1000000,
                    description: 'Energía Enero',
                    status: 'PENDING'
                },
                {
                    unitId: unit.id,
                    providerId: epm.id,
                    invoiceNumber: 'EPM-002',
                    invoiceDate: new Date('2025-01-01'),
                    dueDate: new Date('2025-01-15'),
                    subtotal: 500000,
                    taxIva: 0,
                    totalAmount: 500000,
                    description: 'Acueducto Enero',
                    status: 'PENDING'
                },
                {
                    unitId: unit.id,
                    providerId: epm.id,
                    invoiceNumber: 'EPM-003',
                    invoiceDate: new Date('2025-01-01'),
                    dueDate: new Date('2025-01-15'),
                    subtotal: 200000,
                    taxIva: 0,
                    totalAmount: 200000,
                    description: 'Gas Enero',
                    status: 'PENDING'
                }
            ] as any[], // Force cast to avoid complexity
            skipDuplicates: true
        })
        console.log('Created EPM invoices')
    }

    // 4. Create Invoices for Atlas
    const atlas = providers.find(p => p.nit === '800123456')
    if (atlas) {
        await prisma.invoice.create({
            data: {
                unitId: unit.id,
                providerId: atlas.id,
                invoiceNumber: 'ATLAS-5501',
                invoiceDate: new Date('2025-01-05'),
                dueDate: new Date('2025-01-30'),
                subtotal: 5000000,
                taxIva: 950000,
                totalAmount: 5950000,
                description: 'Servicio Vigilancia Enero',
                status: 'PENDING'
            } as any
        })
        console.log('Created Atlas invoices')
    }

    console.log('✅ Seed completed successfully!')
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
