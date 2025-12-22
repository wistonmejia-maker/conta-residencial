import { PrismaClient } from '@prisma/client'

// Lazy initialization - only create PrismaClient when first used
// This ensures environment variables are fully loaded before connecting
let prisma: PrismaClient | null = null

function getPrismaClient(): PrismaClient {
    if (!prisma) {
        console.log('Initializing PrismaClient...')
        console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'SET (length: ' + process.env.DATABASE_URL.length + ')' : 'NOT SET')
        prisma = new PrismaClient()
    }
    return prisma
}

// Export a proxy that lazily initializes the client
export default new Proxy({} as PrismaClient, {
    get(_target, prop) {
        return (getPrismaClient() as any)[prop]
    }
})
