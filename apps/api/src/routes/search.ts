import { Router } from 'express'
import prisma from '../lib/prisma'

const router = Router()

// Global search endpoint
router.get('/', async (req, res) => {
    try {
        const { q, unitId, limit = '5' } = req.query

        if (!q || String(q).length < 2) {
            return res.json({ results: [] })
        }

        const searchTerm = String(q)
        const maxResults = Math.min(parseInt(String(limit)), 10)

        // Search providers
        const providers = await prisma.provider.findMany({
            where: {
                OR: [
                    { name: { contains: searchTerm, mode: 'insensitive' } },
                    { nit: { contains: searchTerm } }
                ],
                status: 'ACTIVE'
            },
            select: {
                id: true,
                name: true,
                nit: true
            },
            take: maxResults
        })

        // Search invoices (filtered by unit if provided)
        const invoiceWhere: any = {
            OR: [
                { invoiceNumber: { contains: searchTerm, mode: 'insensitive' } },
                { description: { contains: searchTerm, mode: 'insensitive' } },
                { provider: { name: { contains: searchTerm, mode: 'insensitive' } } }
            ]
        }
        if (unitId) invoiceWhere.unitId = String(unitId)

        const invoices = await prisma.invoice.findMany({
            where: invoiceWhere,
            select: {
                id: true,
                invoiceNumber: true,
                provider: { select: { name: true } },
                totalAmount: true,
                status: true
            },
            orderBy: { invoiceDate: 'desc' },
            take: maxResults
        })

        // Search payments by CE number (filtered by unit if provided)
        const paymentWhere: any = {}
        if (unitId) paymentWhere.unitId = String(unitId)

        // Try to match consecutive number
        const numMatch = searchTerm.match(/\d+/)
        if (numMatch) {
            paymentWhere.consecutiveNumber = parseInt(numMatch[0])
        }

        const payments = await prisma.payment.findMany({
            where: Object.keys(paymentWhere).length > 0 ? paymentWhere : undefined,
            select: {
                id: true,
                consecutiveNumber: true,
                paymentDate: true,
                netValue: true
            },
            orderBy: { paymentDate: 'desc' },
            take: numMatch ? maxResults : 0
        })

        res.json({
            results: [
                ...providers.map(p => ({
                    type: 'provider',
                    id: p.id,
                    title: p.name,
                    subtitle: `NIT: ${p.nit}`,
                    url: `/providers/${p.id}`
                })),
                ...invoices.map(i => ({
                    type: 'invoice',
                    id: i.id,
                    title: `Factura ${i.invoiceNumber}`,
                    subtitle: `${i.provider.name} - ${i.status === 'PAID' ? 'Pagada' : 'Pendiente'}`,
                    url: `/invoices?search=${i.invoiceNumber}`
                })),
                ...payments.map(p => ({
                    type: 'payment',
                    id: p.id,
                    title: `CE-${String(p.consecutiveNumber).padStart(4, '0')}`,
                    subtitle: `${new Date(p.paymentDate).toLocaleDateString('es-CO')}`,
                    url: `/payments?search=${p.consecutiveNumber}`
                }))
            ]
        })
    } catch (error) {
        console.error('Error in global search:', error)
        res.status(500).json({ error: 'Error searching' })
    }
})

export default router
