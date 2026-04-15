import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.DATABASE_URL

console.log('=== Prisma Initialization ===')
if (!databaseUrl) {
    console.error('❌ CRITICAL: DATABASE_URL is not set!')
} else {
    // Sanitize URL for logging (hide password)
    const sanitizedUrl = databaseUrl.replace(/:([^:@]+)@/, ':****@')
    console.log(`📡 Prisma connecting to: ${sanitizedUrl}`)
    
    if (!databaseUrl.includes('pgbouncer=true')) {
        console.warn('⚠️ WARNING: Using Neon pooler without pgbouncer=true might cause connection issues with Prisma.')
    }
}

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: databaseUrl
        }
    },
    log: [
        { level: 'error', emit: 'stdout' },
        { level: 'warn', emit: 'stdout' }
    ]
})

export default prisma
