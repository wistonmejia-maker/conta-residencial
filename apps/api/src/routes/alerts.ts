import { Router } from 'express'
import prisma from '../lib/prisma'

const router = Router()

// GET missing recurring invoices for current month
router.get('/missing-invoices', async (req, res) => {
    try {
        const { unitId, month, year } = req.query

        if (!unitId) {
            return res.status(400).json({ error: 'unitId is required' })
        }

        // Default to current month
        const now = new Date()
        const targetMonth = month ? Number(month) : now.getMonth() + 1
        const targetYear = year ? Number(year) : now.getFullYear()

        // Get start and end of the target month
        const startDate = new Date(targetYear, targetMonth - 1, 1)
        const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59)

        // Get all recurring providers for this unit from the config table
        const recurringConfigs = await prisma.providerUnitConfig.findMany({
            where: {
                unitId: String(unitId),
                isRecurring: true
            },
            include: {
                provider: {
                    select: {
                        id: true,
                        name: true,
                        nit: true,
                        status: true,
                        invoices: {
                            where: {
                                unitId: String(unitId),
                                invoiceDate: {
                                    gte: startDate,
                                    lte: endDate
                                }
                            },
                            select: {
                                id: true,
                                invoiceNumber: true,
                                invoiceDate: true
                            }
                        }
                    }
                }
            }
        })

        // Filter to only active providers missing invoices for this month
        const missingInvoices = recurringConfigs
            .filter(c => c.provider.status === 'ACTIVE' && c.provider.invoices.length === 0)
            .map(c => ({
                providerId: c.provider.id,
                providerName: c.provider.name,
                providerNit: c.provider.nit,
                category: c.category,
                month: targetMonth,
                year: targetYear
            }))

        res.json({
            month: targetMonth,
            year: targetYear,
            totalRecurring: recurringConfigs.filter(c => c.provider.status === 'ACTIVE').length,
            missing: missingInvoices.length,
            providers: missingInvoices
        })
    } catch (error) {
        console.error('Error fetching missing invoices:', error)
        res.status(500).json({ error: 'Error fetching missing invoices' })
    }
})

// GET all recurring providers
router.get('/recurring-providers', async (req, res) => {
    try {
        const { unitId } = req.query

        if (!unitId) {
            return res.status(400).json({ error: 'unitId is required' })
        }

        const providers = await prisma.provider.findMany({
            where: {
                unitId: String(unitId),
                isRecurring: true,
                status: 'ACTIVE'
            },
            select: {
                id: true,
                name: true,
                nit: true,
                recurringCategory: true
            },
            orderBy: { name: 'asc' }
        })

        res.json({ providers })
    } catch (error) {
        console.error('Error fetching recurring providers:', error)
        res.status(500).json({ error: 'Error fetching recurring providers' })
    }
})

export default router
