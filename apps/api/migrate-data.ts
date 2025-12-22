import { PrismaClient } from '@prisma/client'

const localPrisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.LOCAL_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/conta_residencial'
        }
    }
})

const prodPrisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.DATABASE_URL
        }
    }
})

async function migrateData() {
    console.log('🔄 Starting data migration from local to production...\n')

    try {
        // 1. Migrate Units
        console.log('📦 Fetching units from local database...')
        const units = await localPrisma.unit.findMany()
        console.log(`   Found ${units.length} units`)

        if (units.length > 0) {
            console.log('   Inserting units to production...')
            for (const unit of units) {
                await prodPrisma.unit.upsert({
                    where: { id: unit.id },
                    update: unit,
                    create: unit
                })
            }
            console.log(`   ✅ ${units.length} units migrated`)
        }

        // 2. Migrate Providers
        console.log('\n📦 Fetching providers from local database...')
        const providers = await localPrisma.provider.findMany()
        console.log(`   Found ${providers.length} providers`)

        if (providers.length > 0) {
            console.log('   Inserting providers to production...')
            for (const provider of providers) {
                await prodPrisma.provider.upsert({
                    where: { id: provider.id },
                    update: provider,
                    create: provider
                })
            }
            console.log(`   ✅ ${providers.length} providers migrated`)
        }

        // 3. Migrate ProviderUnitConfig
        console.log('\n📦 Fetching provider unit configs from local database...')
        const configs = await localPrisma.providerUnitConfig.findMany()
        console.log(`   Found ${configs.length} provider unit configs`)

        if (configs.length > 0) {
            console.log('   Inserting configs to production...')
            for (const config of configs) {
                await prodPrisma.providerUnitConfig.upsert({
                    where: { id: config.id },
                    update: config,
                    create: config
                })
            }
            console.log(`   ✅ ${configs.length} configs migrated`)
        }

        console.log('\n🎉 Migration completed successfully!')

    } catch (error) {
        console.error('❌ Migration failed:', error)
    } finally {
        await localPrisma.$disconnect()
        await prodPrisma.$disconnect()
    }
}

migrateData()
