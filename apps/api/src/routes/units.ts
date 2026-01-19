import { Router } from 'express'
import prisma from '../lib/prisma'

const router = Router()

// GET all active units
router.get('/', async (req, res) => {
    try {
        const units = await prisma.unit.findMany({
            where: { isActive: true },
            orderBy: { createdAt: 'desc' }
        })
        res.json({ units })
    } catch (error) {
        console.error('Error fetching units:', error)
        res.status(500).json({ error: 'Error fetching units' })
    }
})

// GET single unit
router.get('/:id', async (req, res) => {
    try {
        const unit = await prisma.unit.findUnique({
            where: { id: req.params.id },
            include: {
                accountant: { select: { id: true, name: true } },
                admin: { select: { id: true, name: true } },
                fiscalRevisor: { select: { id: true, name: true } },
                _count: {
                    select: { invoices: true, payments: true }
                }
            }
        })
        if (!unit) {
            return res.status(404).json({ error: 'Unit not found' })
        }
        res.json(unit)
    } catch (error) {
        console.error('Error fetching unit:', error)
        res.status(500).json({ error: 'Error fetching unit' })
    }
})

// POST create unit
router.post('/', async (req, res) => {
    try {
        const {
            name, taxId, address, consecutiveSeed,
            email, observations, logoUrl, bankAccountInfo,
            propertyType, totalTowers, totalUnits,
            defaultPaymentType,
            accountantId, adminId, fiscalRevisorId,
            gmailScanStartDate
        } = req.body

        if (!name || !taxId) {
            return res.status(400).json({ error: 'Name and taxId are required' })
        }

        const unit = await prisma.unit.create({
            data: {
                name, taxId, address,
                consecutiveSeed: Number(consecutiveSeed) || 1,
                email: email || null,
                observations: observations || null,
                logoUrl: logoUrl || null,
                bankAccountInfo: bankAccountInfo || null,
                propertyType: propertyType || 'RESIDENTIAL',
                totalTowers: totalTowers ? Number(totalTowers) : null,
                totalUnits: totalUnits ? Number(totalUnits) : null,
                defaultPaymentType: defaultPaymentType || 'INTERNAL',
                accountantId: accountantId || null,
                adminId: adminId || null,
                fiscalRevisorId: fiscalRevisorId || null,
                gmailScanStartDate: gmailScanStartDate ? new Date(gmailScanStartDate) : null
            }
        })
        res.status(201).json(unit)
    } catch (error) {
        console.error('Error creating unit:', error)
        res.status(500).json({ error: 'Error creating unit' })
    }
})

// PUT update unit
router.put('/:id', async (req, res) => {
    try {
        const {
            name, taxId, address, consecutiveSeed,
            email, observations, logoUrl, bankAccountInfo,
            propertyType, totalTowers, totalUnits,
            defaultPaymentType,
            accountantId, adminId, fiscalRevisorId,
            gmailScanStartDate
        } = req.body

        const unit = await prisma.unit.update({
            where: { id: req.params.id },
            data: {
                name, taxId, address,
                consecutiveSeed: Number(consecutiveSeed),
                email: email || null,
                observations: observations || null,
                logoUrl: logoUrl || null,
                bankAccountInfo: bankAccountInfo || null,
                propertyType,
                totalTowers: totalTowers ? Number(totalTowers) : null,
                totalUnits: totalUnits ? Number(totalUnits) : null,
                defaultPaymentType,
                accountantId: accountantId || null,
                adminId: adminId || null,
                fiscalRevisorId: fiscalRevisorId || null,
                gmailScanStartDate: gmailScanStartDate !== undefined ? (gmailScanStartDate ? new Date(gmailScanStartDate) : null) : undefined
            }
        })
        res.json(unit)
    } catch (error) {
        console.error('Error updating unit:', error)
        res.status(500).json({ error: 'Error updating unit' })
    }
})

// DELETE unit (Soft Delete)
router.delete('/:id', async (req, res) => {
    try {
        // Validate unit exists and is active
        const unit = await prisma.unit.findUnique({
            where: { id: req.params.id }
        })

        if (!unit) {
            return res.status(404).json({ error: 'Unit not found' })
        }

        if (!unit.isActive) {
            return res.status(400).json({ error: 'Unit is already archived' })
        }

        // Soft delete - mark as inactive
        await prisma.unit.update({
            where: { id: req.params.id },
            data: {
                isActive: false,
                deletedAt: new Date()
                // deletedBy: req.user?.id // Add when authentication is implemented
            }
        })

        res.json({ success: true, message: 'Unit archived successfully' })
    } catch (error) {
        console.error('Error archiving unit:', error)
        res.status(500).json({ error: 'Error archiving unit' })
    }
})

// GET archived units
router.get('/archived/list', async (req, res) => {
    try {
        const units = await prisma.unit.findMany({
            where: { isActive: false },
            orderBy: { deletedAt: 'desc' }
        })
        res.json({ units })
    } catch (error) {
        console.error('Error fetching archived units:', error)
        res.status(500).json({ error: 'Error fetching archived units' })
    }
})

// POST restore unit
router.post('/:id/restore', async (req, res) => {
    try {
        const unit = await prisma.unit.findUnique({
            where: { id: req.params.id }
        })

        if (!unit) {
            return res.status(404).json({ error: 'Unit not found' })
        }

        if (unit.isActive) {
            return res.status(400).json({ error: 'Unit is already active' })
        }

        const restoredUnit = await prisma.unit.update({
            where: { id: req.params.id },
            data: {
                isActive: true,
                deletedAt: null,
                deletedBy: null
            }
        })

        res.json(restoredUnit)
    } catch (error) {
        console.error('Error restoring unit:', error)
        res.status(500).json({ error: 'Error restoring unit' })
    }
})

export default router
