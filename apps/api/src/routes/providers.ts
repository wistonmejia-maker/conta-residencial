import { Router } from 'express'
import prisma from '../lib/prisma'
import { createProviderSchema } from '../schemas/provider.schema'

const router = Router()

// Algoritmo Módulo 11 para calcular DV del NIT colombiano
function calcularDV(nit: string): string {
    const nitLimpio = nit.replace(/[^0-9]/g, '')
    const primos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71]
    let suma = 0

    for (let i = 0; i < nitLimpio.length; i++) {
        suma += parseInt(nitLimpio[nitLimpio.length - 1 - i]) * primos[i]
    }

    const residuo = suma % 11
    if (residuo === 0 || residuo === 1) return residuo.toString()
    return (11 - residuo).toString()
}

// GET all providers (GLOBAL - no unitId filter needed)
router.get('/', async (req, res) => {
    try {
        const { status, search, category } = req.query

        const where: any = {}
        if (status) where.status = status
        if (category) where.category = category
        if (search) {
            where.OR = [
                { name: { contains: String(search), mode: 'insensitive' } },
                { nit: { contains: String(search) } }
            ]
        }

        const providers = await prisma.provider.findMany({
            where,
            include: {
                _count: { select: { invoices: true, documents: true } }
            },
            orderBy: { name: 'asc' }
        })
        res.json({ providers })
    } catch (error) {
        console.error('Error fetching providers:', error)
        res.status(500).json({ error: 'Error fetching providers' })
    }
})

// GET single provider with full detail (invoices, payments, documents, stats)
router.get('/:id', async (req, res) => {
    try {
        const { unitId } = req.query

        const provider = await prisma.provider.findUnique({
            where: { id: req.params.id },
            include: {
                documents: {
                    orderBy: { uploadedAt: 'desc' }
                }
            }
        })

        if (!provider) {
            return res.status(404).json({ error: 'Provider not found' })
        }

        // Get all invoices for this provider (optionally filtered by unit)
        const invoiceWhere: any = { providerId: req.params.id }
        if (unitId) invoiceWhere.unitId = String(unitId)

        const invoices = await prisma.invoice.findMany({
            where: invoiceWhere,
            orderBy: { invoiceDate: 'desc' },
            include: {
                unit: { select: { name: true } }
            }
        })

        // Get all payments that include invoices from this provider
        const invoiceIds = invoices.map(i => i.id)

        const paymentItems = await prisma.paymentInvoice.findMany({
            where: { invoiceId: { in: invoiceIds } },
            include: {
                payment: {
                    include: {
                        unit: { select: { name: true } }
                    }
                },
                invoice: { select: { invoiceNumber: true } }
            }
        })

        // Unique payments
        const paymentsMap = new Map()
        for (const item of paymentItems) {
            if (!paymentsMap.has(item.payment.id)) {
                paymentsMap.set(item.payment.id, {
                    ...item.payment,
                    invoicesIncluded: []
                })
            }
            paymentsMap.get(item.payment.id).invoicesIncluded.push(item.invoice.invoiceNumber)
        }
        const payments = Array.from(paymentsMap.values())

        // Calculate statistics
        const totalInvoiced = invoices.reduce((sum, i) => sum + Number(i.totalAmount), 0)
        const totalPending = invoices
            .filter(i => i.status === 'PENDING')
            .reduce((sum, i) => sum + Number(i.totalAmount), 0)
        const totalPaid = payments.reduce((sum, p) => sum + Number(p.netValue), 0)

        res.json({
            provider,
            invoices,
            payments,
            stats: {
                totalInvoiced,
                totalPending,
                totalPaid,
                invoiceCount: invoices.length,
                paymentCount: payments.length
            }
        })
    } catch (error) {
        console.error('Error fetching provider detail:', error)
        res.status(500).json({ error: 'Error fetching provider detail' })
    }
})

// POST create provider (GLOBAL - no unitId needed)
router.post('/', async (req, res) => {
    try {
        const validation = createProviderSchema.safeParse(req.body)

        if (!validation.success) {
            return res.status(400).json({
                error: 'Validation Error',
                details: validation.error.format()
            })
        }

        const {
            name, taxType, nit, dv,
            email, phone, address, city,
            bankAccount, bankName, accountType,
            defaultRetefuentePerc, defaultReteicaPerc,
            isRecurring, recurringCategory, category
        } = validation.data

        // Validar DV si se proporcionó
        const calculatedDV = calcularDV(nit)
        if (dv && dv !== calculatedDV) {
            return res.status(400).json({
                error: `DV incorrecto. El DV calculado para ${nit} es ${calculatedDV}`,
                calculatedDV
            })
        }

        const provider = await prisma.provider.create({
            data: {
                name,
                taxType,
                nit: nit.replace(/[^0-9]/g, ''),
                dv: dv || calculatedDV,
                email,
                phone,
                address,
                city,
                bankAccount,
                bankName,
                accountType,
                defaultRetefuentePerc: defaultRetefuentePerc || 0,
                defaultReteicaPerc: defaultReteicaPerc || 0,
                isRecurring: isRecurring || false,
                recurringCategory,
                category
            }
        })
        res.status(201).json(provider)
    } catch (error: any) {
        console.error('Error creating provider:', error)
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Ya existe un proveedor con ese NIT' })
        }
        res.status(500).json({ error: 'Error creating provider' })
    }
})

// PUT update provider
router.put('/:id', async (req, res) => {
    try {
        const {
            name, taxType, nit, dv, status,
            email, phone, address, city,
            bankAccount, bankName, accountType,
            defaultRetefuentePerc, defaultReteicaPerc,
            isRecurring, recurringCategory, category
        } = req.body

        // If NIT is being changed, validate it
        let cleanNit = undefined
        let finalDv = dv
        if (nit) {
            cleanNit = nit.replace(/[^0-9]/g, '')
            const calculatedDV = calcularDV(cleanNit)
            if (!dv) finalDv = calculatedDV
        }

        const provider = await prisma.provider.update({
            where: { id: req.params.id },
            data: {
                name,
                taxType,
                nit: cleanNit,
                dv: finalDv,
                status,
                email,
                phone,
                address,
                city,
                bankAccount,
                bankName,
                accountType,
                defaultRetefuentePerc,
                defaultReteicaPerc,
                isRecurring,
                recurringCategory,
                category
            }
        })
        res.json(provider)
    } catch (error: any) {
        console.error('Error updating provider:', error)
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Ya existe otro proveedor con ese NIT' })
        }
        res.status(500).json({ error: 'Error updating provider' })
    }
})

// DELETE provider
router.delete('/:id', async (req, res) => {
    try {
        await prisma.provider.delete({
            where: { id: req.params.id }
        })
        res.json({ success: true })
    } catch (error) {
        console.error('Error deleting provider:', error)
        res.status(500).json({ error: 'Error deleting provider' })
    }
})

// POST validate NIT (utility endpoint)
router.post('/validate-nit', async (req, res) => {
    const { nit } = req.body
    if (!nit) {
        return res.status(400).json({ error: 'NIT is required' })
    }
    const cleanNit = nit.replace(/[^0-9]/g, '')
    const dv = calcularDV(cleanNit)

    // Check if NIT already exists
    const existing = await prisma.provider.findUnique({ where: { nit: cleanNit } })

    res.json({
        nit: cleanNit,
        dv,
        formatted: `${cleanNit}-${dv}`,
        exists: !!existing,
        existingProvider: existing ? { id: existing.id, name: existing.name } : null
    })
})

// ============================================
// BULK IMPORT
// ============================================

// POST bulk import providers from JSON array
router.post('/bulk', async (req, res) => {
    try {
        const { providers } = req.body

        if (!Array.isArray(providers) || providers.length === 0) {
            return res.status(400).json({ error: 'providers array is required' })
        }

        const results = {
            success: [] as any[],
            errors: [] as any[]
        }

        for (const p of providers) {
            try {
                if (!p.name || !p.nit) {
                    results.errors.push({ nit: p.nit, error: 'name and nit are required' })
                    continue
                }

                const cleanNit = p.nit.toString().replace(/[^0-9]/g, '')
                const calculatedDV = calcularDV(cleanNit)

                const provider = await prisma.provider.create({
                    data: {
                        name: p.name,
                        taxType: p.taxType || 'Juridica',
                        nit: cleanNit,
                        dv: p.dv || calculatedDV,
                        email: p.email,
                        phone: p.phone,
                        address: p.address,
                        city: p.city,
                        bankAccount: p.bankAccount,
                        bankName: p.bankName,
                        accountType: p.accountType,
                        defaultRetefuentePerc: p.defaultRetefuentePerc || 0,
                        defaultReteicaPerc: p.defaultReteicaPerc || 0
                    }
                })
                results.success.push({ nit: cleanNit, id: provider.id, name: provider.name })
            } catch (error: any) {
                if (error.code === 'P2002') {
                    results.errors.push({ nit: p.nit, error: 'NIT duplicado' })
                } else {
                    results.errors.push({ nit: p.nit, error: error.message })
                }
            }
        }

        res.json({
            total: providers.length,
            created: results.success.length,
            failed: results.errors.length,
            results
        })
    } catch (error) {
        console.error('Error bulk importing providers:', error)
        res.status(500).json({ error: 'Error bulk importing providers' })
    }
})

// ============================================
// DOCUMENTS
// ============================================

// GET documents for a provider
router.get('/:id/documents', async (req, res) => {
    try {
        const documents = await prisma.providerDocument.findMany({
            where: { providerId: req.params.id },
            orderBy: { uploadedAt: 'desc' }
        })
        res.json({ documents })
    } catch (error) {
        console.error('Error fetching documents:', error)
        res.status(500).json({ error: 'Error fetching documents' })
    }
})

// POST add document to provider
router.post('/:id/documents', async (req, res) => {
    try {
        const { type, fileName, fileUrl, fileSize, expiresAt, notes } = req.body

        if (!type || !fileName || !fileUrl) {
            return res.status(400).json({ error: 'type, fileName, and fileUrl are required' })
        }

        const document = await prisma.providerDocument.create({
            data: {
                providerId: req.params.id,
                type,
                fileName,
                fileUrl,
                fileSize,
                expiresAt: expiresAt ? new Date(expiresAt) : null,
                notes
            }
        })
        res.status(201).json(document)
    } catch (error) {
        console.error('Error creating document:', error)
        res.status(500).json({ error: 'Error creating document' })
    }
})

// DELETE document
router.delete('/:id/documents/:docId', async (req, res) => {
    try {
        await prisma.providerDocument.delete({
            where: { id: req.params.docId }
        })
        res.json({ success: true })
    } catch (error) {
        console.error('Error deleting document:', error)
        res.status(500).json({ error: 'Error deleting document' })
    }
})

// GET expired/expiring documents
router.get('/alerts/documents', async (req, res) => {
    try {
        const { daysAhead = 30 } = req.query
        const futureDate = new Date()
        futureDate.setDate(futureDate.getDate() + Number(daysAhead))

        const documents = await prisma.providerDocument.findMany({
            where: {
                expiresAt: {
                    lte: futureDate
                }
            },
            include: {
                provider: { select: { id: true, name: true, nit: true } }
            },
            orderBy: { expiresAt: 'asc' }
        })

        const expired = documents.filter(d => d.expiresAt && d.expiresAt < new Date())
        const expiring = documents.filter(d => d.expiresAt && d.expiresAt >= new Date())

        res.json({ expired, expiring, total: documents.length })
    } catch (error) {
        console.error('Error fetching document alerts:', error)
        res.status(500).json({ error: 'Error fetching document alerts' })
    }
})

export default router
