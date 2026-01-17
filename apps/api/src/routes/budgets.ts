import { Router } from 'express'
import prisma from '../lib/prisma'
import { extractBudgetFromDocument, analyzeBudgetDeeply } from '../services/ai.service'
import multer from 'multer'

const upload = multer({ storage: multer.memoryStorage() })
const router = Router()

// GET /budgets?unitId=...&month=...&year=...
router.get('/', async (req, res) => {
    try {
        const { unitId, month, year } = req.query
        if (!unitId || !month || !year) {
            return res.status(400).json({ error: 'Missing parameters' })
        }

        const budgets = await prisma.budget.findMany({
            where: {
                unitId: String(unitId),
                month: Number(month),
                year: Number(year)
            }
        })

        res.json({ budgets })
    } catch (error) {
        console.error('Error fetching budgets:', error)
        res.status(500).json({ error: 'Failed to fetch budgets' })
    }
})


// POST /budgets/import
router.post('/import', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

        const buffer = req.file.buffer
        const mimeType = req.file.mimetype

        // Use AI to extract budget items
        const result = await extractBudgetFromDocument(buffer, mimeType)

        res.json({ items: result.items })
    } catch (error) {
        console.error('Error importing budget:', error)
        res.status(500).json({ error: 'Failed to process document' })
    }
})

// POST /budgets
router.post('/', async (req, res) => {
    try {
        const { unitId, month, year, items } = req.body
        // items: { category: string, amount: number }[]

        if (!unitId || !month || !year || !Array.isArray(items)) {
            return res.status(400).json({ error: 'Invalid data' })
        }

        // Upsert all items
        const operations = items.map((item: any) =>
            prisma.budget.upsert({
                where: {
                    unitId_year_month_category: {
                        unitId,
                        year: Number(year),
                        month: Number(month),
                        category: item.category
                    }
                },
                update: { amount: item.amount },
                create: {
                    unitId,
                    year: Number(year),
                    month: Number(month),
                    category: item.category,
                    amount: item.amount
                }
            })
        )

        await prisma.$transaction(operations)

        res.json({ success: true })
    } catch (error) {
        console.error('Error saving budgets:', error)
        res.status(500).json({ error: 'Failed to save budgets' })
    }
})

// GET /budgets/execution?unitId=...&month=...&year=...
router.get('/execution', async (req, res) => {
    try {
        const { unitId, month, year } = req.query
        if (!unitId || !month || !year) return res.status(400).json({ error: 'Missing params' })

        // 1. Get Budgets
        const budgets = await prisma.budget.findMany({
            where: { unitId: String(unitId), month: Number(month), year: Number(year) }
        })

        // 2. Get Payments (Execution)
        // We need start/end date for the month
        const startDate = new Date(Number(year), Number(month) - 1, 1)
        const endDate = new Date(Number(year), Number(month), 0, 23, 59, 59)

        const payments = await prisma.payment.findMany({
            where: {
                unitId: String(unitId),
                paymentDate: { gte: startDate, lte: endDate },
                status: 'PAID'
            },
            include: { provider: true }
        })

        // 3. Aggregate Execution by Category
        const executionMap: Record<string, number> = {}
        payments.forEach(p => {
            const cat = p.provider?.category || 'Sin Categoría'
            executionMap[cat] = (executionMap[cat] || 0) + Number(p.amountPaid)
        })

        // 4. Combine
        const allCategories = new Set([
            ...budgets.map(b => b.category),
            ...Object.keys(executionMap)
        ])

        const comparison = Array.from(allCategories).map(cat => {
            const budgeted = Number(budgets.find(b => b.category === cat)?.amount || 0)
            const executed = executionMap[cat] || 0
            const difference = budgeted - executed
            const percent = budgeted > 0 ? (executed / budgeted) * 100 : (executed > 0 ? 100 : 0)

            return {
                category: cat,
                budgeted,
                executed,
                difference,
                percent,
                status: executed > budgeted ? 'OVER_BUDGET' : 'OK'
            }
        })

        res.json({ comparison })
    } catch (error) {
        console.error(error)
        res.status(500).json({ error: 'Analysis failed' })
    }
})


// POST /budgets/analyze
router.post('/analyze', async (req, res) => {
    try {
        const { unitId, month, year } = req.body
        if (!unitId || !month || !year) return res.status(400).json({ error: 'Missing params' })

        // 1. Get Budgets
        const budgets = await prisma.budget.findMany({
            where: { unitId: String(unitId), month: Number(month), year: Number(year) }
        })

        // 2. Get Payments
        const startDate = new Date(Number(year), Number(month) - 1, 1)
        const endDate = new Date(Number(year), Number(month), 0, 23, 59, 59)

        const payments = await prisma.payment.findMany({
            where: {
                unitId: String(unitId),
                paymentDate: { gte: startDate, lte: endDate },
                status: 'PAID'
            },
            include: { provider: true }
        })

        // 3. Aggregate Execution (Summary)
        const executionMap: Record<string, number> = {}
        const transactionsByCategory: Record<string, any[]> = {}

        payments.forEach(p => {
            const cat = p.provider?.category || 'Sin Categoría'
            executionMap[cat] = (executionMap[cat] || 0) + Number(p.amountPaid)

            if (!transactionsByCategory[cat]) transactionsByCategory[cat] = []
            transactionsByCategory[cat].push({
                description: p.provider?.name || 'Desconocido',
                amount: Number(p.amountPaid),
                date: p.paymentDate
            })
        })

        // Sort and take top 3 per category
        const topTransactions: any[] = []
        Object.keys(transactionsByCategory).forEach(cat => {
            transactionsByCategory[cat].sort((a, b) => b.amount - a.amount)
            topTransactions.push({
                category: cat,
                top: transactionsByCategory[cat].slice(0, 3)
            })
        })

        // 4. Comparison Summary for AI
        const summary = budgets.map(b => ({
            category: b.category,
            budget: Number(b.amount),
            executed: executionMap[b.category] || 0,
            percent: (executionMap[b.category] || 0) / Number(b.amount)
        }))

        // 5. Call AI
        const analysis = await analyzeBudgetDeeply(Number(month), Number(year), summary, topTransactions)

        res.json(analysis)

    } catch (error) {
        console.error('Deep analysis failed:', error)
        res.status(500).json({ error: 'Deep analysis failed' })
    }
})

export default router
