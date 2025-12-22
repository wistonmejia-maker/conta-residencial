import { PrismaClient } from '@prisma/client'

// Initialize PrismaClient with explicit datasource URL
// This overrides the schema.prisma env("DATABASE_URL") and uses runtime environment variable
const databaseUrl = process.env.DATABASE_URL

console.log('=== Prisma Initialization ===')
console.log('DATABASE_URL exists:', !!databaseUrl)
console.log('DATABASE_URL starts with postgresql:', databaseUrl?.startsWith('postgresql://'))
console.log('DATABASE_URL length:', databaseUrl?.length || 0)

if (!databaseUrl) {
    console.error('WARNING: DATABASE_URL is not set!')
}

const prisma = new PrismaClient({
    datasources: databaseUrl ? {
        db: {
            url: databaseUrl
        }
    } : undefined,
    log: ['error', 'warn']
})

export default prisma
