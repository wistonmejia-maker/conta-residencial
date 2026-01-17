import { Router } from 'express'
import prisma from '../lib/prisma'
import { answerFinancialQuery, analyzeReportData } from '../services/ai.service'

const router = Router()

// POST /chat
// Natural language interface for financial data
router.post('/chat', async (req, res) => {
    try {
        const { unitId, message } = req.body

        if (!unitId || !message) {
            return res.status(400).json({ error: 'unitId and message are required' })
        }

        // 1. Build Context (Last 12 Month Summary)
        // We fetch a simplified view of Invoices and Payments to fit in prompt context
        const endDate = new Date()
        const startDate = new Date()
        startDate.setMonth(startDate.getMonth() - 12)

        const [invoices, payments] = await Promise.all([
            prisma.invoice.findMany({
                where: {
                    unitId: String(unitId),
                    invoiceDate: { gte: startDate }
                },
                select: {
                    invoiceDate: true,
                    totalAmount: true,
                    provider: {
                        select: { name: true }
                    },
                    status: true
                }
            }),
            prisma.payment.findMany({
                where: {
                    unitId: String(unitId),
                    paymentDate: { gte: startDate }
                },
                select: {
                    paymentDate: true,
                    amountPaid: true,
                    status: true
                }
            })
        ])

        const contextData = {
            period: `Last 12 months (${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]})`,
            invoices: invoices.map(i => ({
                date: i.invoiceDate.toISOString().split('T')[0],
                provider: i.provider?.name || 'Unknown',
                amount: Number(i.totalAmount),
                status: i.status
            })),
            payments: payments.map(p => ({
                date: p.paymentDate.toISOString().split('T')[0],
                amount: Number(p.amountPaid),
                status: p.status
            }))
        }

        // 2. Call AI Service
        const answer = await answerFinancialQuery(message, contextData)

        res.json({ answer })

    } catch (error) {
        console.error('Error in AI chat:', error)
        res.status(500).json({ error: 'Error processing query' })
    }
})

// POST /analyze-report
// Analyzes a JSON dataset
router.post('/analyze-report', async (req, res) => {
    try {
        const { reportTitle, data } = req.body

        if (!reportTitle || !data || !Array.isArray(data)) {
            return res.status(400).json({ error: 'reportTitle and data (array) are required' })
        }

        const analysis = await analyzeReportData(reportTitle, data)
        res.json({ analysis })

    } catch (error) {
        console.error('Error in AI analysis:', error)
        res.status(500).json({ error: 'Error processing analysis' })
    }
})

export default router
