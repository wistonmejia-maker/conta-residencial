import { Router } from 'express'
import prisma from '../lib/prisma'
import multer from 'multer'
import { extractBankTransactions, matchBankMovements } from '../services/ai.service'

const upload = multer({ storage: multer.memoryStorage() })

const router = Router()

// GET all bank movements (optionally filtered)
router.get('/', async (req, res) => {
    try {
        const { unitId, isConciliated, month, year } = req.query

        const where: any = {}
        if (unitId) where.unitId = unitId
        if (isConciliated !== undefined) where.isConciliated = isConciliated === 'true'

        // Filter by month/year if provided
        if (month && year) {
            const startDate = new Date(Number(year), Number(month) - 1, 1)
            const endDate = new Date(Number(year), Number(month), 0)
            where.transactionDate = {
                gte: startDate,
                lte: endDate
            }
        }

        const movements = await prisma.bankMovement.findMany({
            where,
            include: {
                conciliation: {
                    include: {
                        payment: {
                            include: {
                                invoiceItems: {
                                    include: {
                                        invoice: {
                                            include: { provider: { select: { name: true } } }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            orderBy: { transactionDate: 'desc' }
        })

        res.json({ movements })
    } catch (error) {
        console.error('Error fetching bank movements:', error)
        res.status(500).json({ error: 'Error fetching bank movements' })
    }
})

// POST create bank movement (manual or from import)
router.post('/', async (req, res) => {
    try {
        const { unitId, transactionDate, description, amount, referenceCode, rawData } = req.body

        if (!unitId || !transactionDate || amount === undefined) {
            return res.status(400).json({
                error: 'unitId, transactionDate, and amount are required'
            })
        }

        const movement = await prisma.bankMovement.create({
            data: {
                unitId,
                transactionDate: new Date(transactionDate),
                description,
                amount,
                referenceCode,
                rawData
            }
        })
        res.status(201).json(movement)
    } catch (error) {
        console.error('Error creating bank movement:', error)
        res.status(500).json({ error: 'Error creating bank movement' })
    }
})

// POST bulk import bank movements
router.post('/import', async (req, res) => {
    try {
        const { unitId, movements } = req.body

        if (!unitId || !movements || !Array.isArray(movements)) {
            return res.status(400).json({
                error: 'unitId and movements array are required'
            })
        }

        const created = await prisma.bankMovement.createMany({
            data: movements.map((m: any) => ({
                unitId,
                transactionDate: new Date(m.transactionDate || m.date),
                description: m.description,
                amount: m.amount,
                referenceCode: m.referenceCode || m.reference,
                rawData: m
            }))
        })

        res.status(201).json({
            imported: created.count,
            message: `Se importaron ${created.count} movimientos bancarios`
        })
    } catch (error) {
        console.error('Error importing bank movements:', error)
        res.status(500).json({ error: 'Error importing bank movements' })
    }
})

// DELETE bank movement
router.delete('/:id', async (req, res) => {
    try {
        const movement = await prisma.bankMovement.findUnique({
            where: { id: req.params.id },
            include: { conciliation: true }
        })

        if (movement?.conciliation) {
            return res.status(400).json({
                error: 'No se puede eliminar un movimiento conciliado'
            })
        }

        await prisma.bankMovement.delete({
            where: { id: req.params.id }
        })
        res.json({ success: true })
    } catch (error) {
        console.error('Error deleting bank movement:', error)
        res.status(500).json({ error: 'Error deleting bank movement' })
    }
})

// === CONCILIATION ROUTES ===

// POST conciliate (match payment with bank movement)
router.post('/conciliate', async (req, res) => {
    try {
        const { paymentId, bankMovementId, notes } = req.body

        if (!paymentId || !bankMovementId) {
            return res.status(400).json({
                error: 'paymentId and bankMovementId are required'
            })
        }

        // Check if already conciliated
        const existingPayment = await prisma.conciliation.findUnique({
            where: { paymentId }
        })
        const existingMovement = await prisma.conciliation.findUnique({
            where: { bankMovementId }
        })

        if (existingPayment) {
            return res.status(400).json({ error: 'Este pago ya está conciliado' })
        }
        if (existingMovement) {
            return res.status(400).json({ error: 'Este movimiento bancario ya está conciliado' })
        }

        // Create conciliation
        const conciliation = await prisma.conciliation.create({
            data: {
                paymentId,
                bankMovementId,
                notes
            },
            include: {
                payment: true,
                bankMovement: true
            }
        })

        // Update related records
        await prisma.payment.update({
            where: { id: paymentId },
            data: { status: 'CONCILIATED' }
        })
        await prisma.bankMovement.update({
            where: { id: bankMovementId },
            data: { isConciliated: true }
        })

        res.status(201).json(conciliation)
    } catch (error) {
        console.error('Error creating conciliation:', error)
        res.status(500).json({ error: 'Error creating conciliation' })
    }
})

// POST auto-conciliate (Magic Match)
router.post('/auto-conciliate', async (req, res) => {
    try {
        const { unitId } = req.body

        if (!unitId) {
            return res.status(400).json({ error: 'unitId is required' })
        }

        // 1. Get unconciliated BANK DEBITS (Negative amounts are likely payments/outflows, depending on bank format)
        // Adjusting assumption: In this system, we import debits as negative values?
        // Let's verify import logic later. Usually bank extracts have positive values in Debit column.
        // We need to match ABS(amount).

        const bankMovements = await prisma.bankMovement.findMany({
            where: {
                unitId,
                isConciliated: false,
                amount: { lt: 0 } // Only look at outflows (negative values)
            }
        })

        // 2. Get unconciliated PAYMENTS
        const payments = await prisma.payment.findMany({
            where: {
                unitId,
                status: { not: 'CONCILIATED' }
            }
        })

        let matchCount = 0

        // 3. Match Logic
        for (const mov of bankMovements) {
            const movAmount = Math.abs(Number(mov.amount))
            const movDate = new Date(mov.transactionDate).getTime()

            // Find candidates with SAME amount and Close Date (+/- 3 days)
            const candidates = payments.filter(p => {
                const payAmount = Number(p.netValue) // Payment net value is positive
                const payDate = new Date(p.paymentDate).getTime()
                const diffDays = Math.abs(movDate - payDate) / (1000 * 60 * 60 * 24)

                // Tolerance: Exact amount matches often have minor float diffs, so we use a tiny epsilon if needed, 
                // but usually currency is 2 decimals fixed.
                // Using a small epsilon for safety: Math.abs(a - b) < 1
                const amountMatch = Math.abs(movAmount - payAmount) < 1
                const dateMatch = diffDays <= 3

                return amountMatch && dateMatch
            })

            // Only auto-conciliate if EXACTLY ONE candidate is found to avoid ambiguity
            if (candidates.length === 1) {
                const payment = candidates[0]

                // Perform Conciliation
                await prisma.$transaction([
                    prisma.conciliation.create({
                        data: {
                            paymentId: payment.id,
                            bankMovementId: mov.id,
                            notes: 'Auto-Conciliated (Magic Match)'
                        }
                    }),
                    prisma.payment.update({
                        where: { id: payment.id },
                        data: { status: 'CONCILIATED' }
                    }),
                    prisma.bankMovement.update({
                        where: { id: mov.id },
                        data: { isConciliated: true }
                    })
                ])

                // Remove from local list to prevent double matching in this loop
                const idx = payments.indexOf(payment)
                if (idx > -1) payments.splice(idx, 1) // Remove matched payment

                matchCount++
            }
        }

        res.json({
            success: true,
            processed: bankMovements.length,
            matched: matchCount,
            message: `Se conciliaron automáticamente ${matchCount} movimientos.`
        })

    } catch (error) {
        console.error('Error auto-conciliating:', error)
        res.status(500).json({ error: 'Error during auto-conciliation' })
    }
})

// POST AI-Powered Extraction (PDF/Image/Excel)
router.post('/ai-extract', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' })
        }

        const result = await extractBankTransactions(
            req.file.buffer,
            req.file.mimetype
        )

        res.json(result)
    } catch (error) {
        console.error('Error extracting bank transactions with AI:', error)
        res.status(500).json({ error: 'Error processing file with AI' })
    }
})

// POST AI-Powered Conciliation (Smart Match)
router.post('/ai-conciliate', async (req, res) => {
    try {
        const { unitId } = req.body

        if (!unitId) {
            return res.status(400).json({ error: 'unitId is required' })
        }

        // 1. Get unconciliated bank movements
        const bankMovements = await prisma.bankMovement.findMany({
            where: {
                unitId,
                isConciliated: false,
                amount: { lt: 0 }
            }
        })

        if (bankMovements.length === 0) {
            return res.json({ success: true, matched: 0, message: 'No hay movimientos bancarios pendientes' })
        }

        // 2. Get pending payments
        const payments = await prisma.payment.findMany({
            where: {
                unitId,
                status: { not: 'CONCILIATED' }
            },
            include: {
                invoiceItems: {
                    include: {
                        invoice: {
                            include: {
                                provider: { select: { name: true } }
                            }
                        }
                    }
                }
            }
        })

        if (payments.length === 0) {
            return res.json({ success: true, matched: 0, message: 'No hay egresos pendientes por conciliar' })
        }

        // Flatten payments for AI consumption (provider name is deep in schema)
        const flatPayments = payments.map(p => ({
            id: p.id,
            paymentDate: p.paymentDate,
            netValue: p.netValue,
            consecutiveNumber: p.consecutiveNumber,
            provider: {
                name: p.invoiceItems[0]?.invoice?.provider?.name || 'N/A'
            }
        }))

        // 3. Call AI to match
        const { matches } = await matchBankMovements(bankMovements, flatPayments)

        let matchCount = 0
        const results = []

        // 4. Apply high-confidence matches
        for (const match of matches) {
            // Only apply if confidence is high (e.g., > 0.8)
            if (match.confidence >= 0.8) {
                try {
                    await prisma.$transaction([
                        prisma.conciliation.create({
                            data: {
                                paymentId: match.paymentId,
                                bankMovementId: match.bankMovementId,
                                notes: `IA Match (${(match.confidence * 100).toFixed(0)}%): ${match.reason}`
                            }
                        }),
                        prisma.payment.update({
                            where: { id: match.paymentId },
                            data: { status: 'CONCILIATED' }
                        }),
                        prisma.bankMovement.update({
                            where: { id: match.bankMovementId },
                            data: { isConciliated: true }
                        })
                    ])
                    matchCount++
                    results.push({ ...match, applied: true })
                } catch (e) {
                    console.error(`Error applying AI match for ${match.paymentId}:`, e)
                    results.push({ ...match, applied: false, error: 'Target record already conciliated or deleted' })
                }
            } else {
                results.push({ ...match, applied: false, reason: 'Confidence too low' })
            }
        }

        res.json({
            success: true,
            matched: matchCount,
            totalMatches: matches.length,
            message: `IA identificó ${matches.length} posibles cruces y aplicó ${matchCount} automáticamente.`,
            details: results
        })

    } catch (error) {
        console.error('Error during AI conciliation:', error)
        res.status(500).json({ error: 'Error during AI conciliation' })
    }
})

// DELETE conciliation (unconciliate)
router.delete('/conciliate/:id', async (req, res) => {
    try {
        const conciliation = await prisma.conciliation.findUnique({
            where: { id: req.params.id }
        })

        if (!conciliation) {
            return res.status(404).json({ error: 'Conciliation not found' })
        }

        // Revert statuses
        await prisma.payment.update({
            where: { id: conciliation.paymentId },
            data: { status: 'COMPLETED' }
        })
        await prisma.bankMovement.update({
            where: { id: conciliation.bankMovementId },
            data: { isConciliated: false }
        })

        await prisma.conciliation.delete({
            where: { id: req.params.id }
        })

        res.json({ success: true })
    } catch (error) {
        console.error('Error deleting conciliation:', error)
        res.status(500).json({ error: 'Error deleting conciliation' })
    }
})

// GET conciliation summary
router.get('/summary', async (req, res) => {
    try {
        const { unitId, month, year } = req.query

        const where: any = unitId ? { unitId: String(unitId) } : {}

        if (month && year) {
            const startDate = new Date(Number(year), Number(month) - 1, 1)
            const endDate = new Date(Number(year), Number(month), 0)
            where.transactionDate = { gte: startDate, lte: endDate }
        }

        const [totalMovements, unconciliated, conciliated] = await Promise.all([
            prisma.bankMovement.aggregate({
                where,
                _sum: { amount: true },
                _count: true
            }),
            prisma.bankMovement.aggregate({
                where: { ...where, isConciliated: false },
                _sum: { amount: true },
                _count: true
            }),
            prisma.bankMovement.aggregate({
                where: { ...where, isConciliated: true },
                _sum: { amount: true },
                _count: true
            })
        ])

        res.json({
            total: {
                count: totalMovements._count,
                amount: Number(totalMovements._sum.amount || 0)
            },
            unconciliated: {
                count: unconciliated._count,
                amount: Number(unconciliated._sum.amount || 0)
            },
            conciliated: {
                count: conciliated._count,
                amount: Number(conciliated._sum.amount || 0)
            }
        })
    } catch (error) {
        console.error('Error fetching conciliation summary:', error)
        res.status(500).json({ error: 'Error fetching summary' })
    }
})

export default router
