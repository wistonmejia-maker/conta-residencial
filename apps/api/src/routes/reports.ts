import { Router } from 'express'
import prisma from '../lib/prisma'

const router = Router()

// GET /reports?unitId=...
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
