import { Router } from 'express'
import prisma from '../lib/prisma'
import { resequencePaymentConsecutives } from './payments'
import { unitSchema } from '../schemas/unit.schema'

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
        const validated = unitSchema.safeParse(req.body)
        if (!validated.success) {
            return res.status(400).json({ error: validated.error.issues[0].message })
        }

        const data = validated.data

        const unit = await prisma.unit.create({
            data: {
                ...data,
                gmailScanStartDate: data.gmailScanStartDate ? new Date(data.gmailScanStartDate) : null,
                accountantId: data.accountantId || null,
                adminId: data.adminId || null,
                fiscalRevisorId: data.fiscalRevisorId || null
            }
        })
        res.status(201).json(unit)
    } catch (error) {
        console.error('Error creating unit:', error)
        res.status(500).json({ error: 'Error creating unit' })
    }
})

router.put('/:id', async (req, res) => {
    try {
        const validated = unitSchema.partial().safeParse(req.body)
        if (!validated.success) {
            return res.status(400).json({ error: validated.error.issues[0].message })
        }

        const data = validated.data

        // Track if consecutiveSeed is being changed
        const seedChanged = data.consecutiveSeed !== undefined

        const unitData: any = { ...data }
        if (data.gmailScanStartDate !== undefined) {
            unitData.gmailScanStartDate = data.gmailScanStartDate ? new Date(data.gmailScanStartDate) : null
        }

        const unit = await prisma.unit.update({
            where: { id: req.params.id },
            data: unitData
        })

        // If consecutiveSeed was changed, resequence existing unfrozen payments
        if (seedChanged) {
            await resequencePaymentConsecutives(req.params.id)
            const updatedUnit = await prisma.unit.findUnique({
                where: { id: req.params.id }
            })
            return res.json(updatedUnit)
        }

        res.json(unit)
    } catch (error: any) {
        console.error('Error updating unit:', error)
        // Return specific error message to help debugging
        res.status(500).json({
            error: error.message || 'Error updating unit',
            details: error.meta || undefined
        })
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
