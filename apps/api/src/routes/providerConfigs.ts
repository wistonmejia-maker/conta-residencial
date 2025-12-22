import { Router } from 'express'
import prisma from '../lib/prisma'

const router = Router()

// GET all provider configs for a unit
router.get('/', async (req, res) => {
    try {
        const { unitId } = req.query

        if (!unitId) {
            return res.status(400).json({ error: 'unitId is required' })
        }

        // Get all configs for this unit with provider details
        const configs = await prisma.providerUnitConfig.findMany({
            where: { unitId: String(unitId) },
            include: {
                provider: {
                    select: {
                        id: true,
                        name: true,
                        nit: true
                    }
                }
            },
            orderBy: { provider: { name: 'asc' } }
        })

        res.json({ configs })
    } catch (error) {
        console.error('Error fetching provider configs:', error)
        res.status(500).json({ error: 'Error fetching provider configs' })
    }
})

// GET recurring providers for a unit (for alerts)
router.get('/recurring', async (req, res) => {
    try {
        const { unitId } = req.query

        if (!unitId) {
            return res.status(400).json({ error: 'unitId is required' })
        }

        const configs = await prisma.providerUnitConfig.findMany({
            where: {
                unitId: String(unitId),
                isRecurring: true
            },
            include: {
                provider: {
                    select: {
                        id: true,
                        name: true,
                        nit: true
                    }
                }
            },
            orderBy: { provider: { name: 'asc' } }
        })

        res.json({
            configs,
            providers: configs.map(c => ({
                ...c.provider,
                category: c.category
            }))
        })
    } catch (error) {
        console.error('Error fetching recurring configs:', error)
        res.status(500).json({ error: 'Error fetching recurring configs' })
    }
})

// PUT upsert a config (create or update)
router.put('/', async (req, res) => {
    try {
        const { providerId, unitId, isRecurring, category } = req.body

        if (!providerId || !unitId) {
            return res.status(400).json({ error: 'providerId and unitId are required' })
        }

        const config = await prisma.providerUnitConfig.upsert({
            where: {
                providerId_unitId: {
                    providerId,
                    unitId
                }
            },
            update: {
                isRecurring: isRecurring ?? false,
                category: category || null
            },
            create: {
                providerId,
                unitId,
                isRecurring: isRecurring ?? false,
                category: category || null
            },
            include: {
                provider: {
                    select: {
                        id: true,
                        name: true,
                        nit: true
                    }
                }
            }
        })

        res.json({ config })
    } catch (error) {
        console.error('Error upserting provider config:', error)
        res.status(500).json({ error: 'Error saving provider config' })
    }
})

// DELETE a config
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params

        await prisma.providerUnitConfig.delete({
            where: { id }
        })

        res.json({ success: true })
    } catch (error) {
        console.error('Error deleting provider config:', error)
        res.status(500).json({ error: 'Error deleting provider config' })
    }
})

export default router
