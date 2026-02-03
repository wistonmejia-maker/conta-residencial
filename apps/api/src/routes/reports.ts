import { Router } from 'express'
import prisma from '../lib/prisma'
import { generateMonthlyInsights } from '../services/ai.service'

const router = Router()

// GET /reports?unitId=...
router.get('/', async (req, res) => {
    try {
        const { unitId } = req.query
        if (!unitId) return res.status(400).json({ error: 'unitId required' })

        const reports = await prisma.monthlyReport.findMany({
            where: { unitId: String(unitId) },
            orderBy: { createdAt: 'desc' },
            include: {
                invoices: { include: { provider: true } },
                payments: {
                    include: {
                        invoiceItems: {
                            include: {
                                invoice: {
                                    include: { provider: true }
                                }
                            }
                        }
                    }
                },
                _count: {
                    select: { invoices: true, payments: true }
                }
            }
        })
        res.json(reports)
    } catch (error) {
        console.error('Error fetching reports:', error)
        res.status(500).json({ error: 'Error fetching reports' })
    }
})

// GET /audit-preview
// Analyzes current month data before closing
router.get('/audit-preview', async (req, res) => {
    try {
        const { unitId, month, year } = req.query

        if (!unitId || !month || !year) {
            return res.status(400).json({ error: 'unitId, month, and year are required' })
        }

        const targetMonth = Number(month)
        const targetYear = Number(year)

        // 1. Fetch Current Month Expenses (Invoices & Payments)
        const startDate = new Date(targetYear, targetMonth - 1, 1)
        const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59)

        const currentExpenses = await prisma.invoice.findMany({
            where: {
                unitId: String(unitId),
                invoiceDate: { gte: startDate, lte: endDate }
            },
            include: { provider: true }
        })

        // 2. Compliance Check: Missing Attachments
        const complianceIssues = []
        const missingFiles = currentExpenses.filter(inv => !inv.fileUrl)
        if (missingFiles.length > 0) {
            complianceIssues.push({
                type: 'MISSING_INVOICE_SUPPORT',
                count: missingFiles.length,
                details: missingFiles.map(i => `${i.provider.name} (${i.invoiceNumber})`)
            })
        }

        // 3. Comparison with 3-Month Average
        // Fetch previous 3 months
        const prevStartDate = new Date(targetYear, targetMonth - 4, 1)
        const prevEndDate = new Date(targetYear, targetMonth - 1, 0)

        const previousExpenses = await prisma.invoice.findMany({
            where: {
                unitId: String(unitId),
                invoiceDate: { gte: prevStartDate, lte: prevEndDate }
            }
        })

        // Group by provider/category for aggregation
        // Simplified: Total expense vs Average total expense
        const currentTotal = currentExpenses.reduce((sum, inv) => sum + Number(inv.totalAmount), 0)
        const previousTotal = previousExpenses.reduce((sum, inv) => sum + Number(inv.totalAmount), 0)
        const averageTotal = previousTotal / 3

        const expensesSummary = [{
            category: 'Total Gastos',
            current: currentTotal,
            average: averageTotal,
            variation: averageTotal > 0 ? ((currentTotal - averageTotal) / averageTotal) * 100 : 0
        }]

        // 4. Generate AI Insights
        const aiAnalysis = await generateMonthlyInsights(
            targetMonth,
            targetYear,
            expensesSummary,
            [{ category: 'Total Promedio', amount: averageTotal }],
            complianceIssues
        )

        res.json({
            date: startDate,
            totalExpenses: currentTotal,
            complianceIssues,
            aiAnalysis
        })

    } catch (error) {
        console.error('Error generating audit preview:', error)
        res.status(500).json({ error: 'Error generating audit preview' })
    }
})

// POST /reports
// Mark month as closed/reported
router.post('/', async (req, res) => {
    try {
        const { unitId, month, year, invoiceIds, paymentIds, pdfUrl } = req.body

        if (!unitId || !month || !year) {
            return res.status(400).json({ error: 'Missing required fields' })
        }

        const report = await prisma.monthlyReport.create({
            data: {
                unitId,
                month,
                year,
                status: 'SENT',
                pdfUrl: pdfUrl || null,
                // Link invoices (set FK)
                invoices: {
                    connect: (invoiceIds as string[] || []).map(id => ({ id }))
                },
                // Link payments (set FK)
                payments: {
                    connect: (paymentIds as string[] || []).map(id => ({ id }))
                }
            }
        })

        res.json(report)
    } catch (error) {
        console.error('Error creating report:', error)
        res.status(500).json({ error: 'Error creating report' })
    }
})

// DELETE /reports/:id
// Reopen month (delete report and unlink docs)
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params

        // 1. Unlink Invoices
        await prisma.invoice.updateMany({
            where: { monthlyReportId: id },
            data: { monthlyReportId: null }
        })

        // 2. Unlink Payments
        await prisma.payment.updateMany({
            where: { monthlyReportId: id },
            data: { monthlyReportId: null }
        })

        // 3. Delete Report
        await prisma.monthlyReport.delete({
            where: { id }
        })

        res.json({ success: true })
    } catch (error) {
        console.error('Error deleting report:', error)
        res.status(500).json({ error: 'Error deleting report' })
    }
})

export default router
