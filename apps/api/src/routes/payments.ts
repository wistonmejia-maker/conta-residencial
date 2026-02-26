import { Router } from 'express'
import prisma from '../lib/prisma'

const router = Router()

// GET all payments (optionally filtered)
router.get('/', async (req, res) => {
    try {
        const { unitId, status, month, year } = req.query



        const where: any = {}
        if (unitId) where.unitId = unitId
        if (status) where.status = status

        // Filter by month/year if provided
        if (month && year) {
            const startDate = new Date(Number(year), Number(month) - 1, 1)
            const endDate = new Date(Number(year), Number(month), 0)
            where.paymentDate = {
                gte: startDate,
                lte: endDate
            }
        }

        const payments = await prisma.payment.findMany({
            where,
            include: {
                invoiceItems: {
                    include: {
                        invoice: {
                            include: {
                                provider: { select: { name: true, nit: true } }
                            }
                        }
                    }
                },
                conciliation: true
            },
            orderBy: [
                { paymentDate: 'desc' },
                { consecutiveNumber: 'desc' }
            ]
        })

        // Flatten provider info for easier frontend consumption
        const paymentsWithProvider = payments.map(p => {
            const firstInvoice = p.invoiceItems[0]?.invoice
            return {
                ...p,
                provider: firstInvoice?.provider || null,
                invoiceCount: p.invoiceItems.length
            }
        })

        res.json({ payments: paymentsWithProvider })
    } catch (error) {
        console.error('Error fetching payments:', error)
        res.status(500).json({ error: 'Error fetching payments' })
    }
})

// GET single payment
router.get('/:id', async (req, res) => {
    try {
        const payment = await prisma.payment.findUnique({
            where: { id: req.params.id },
            include: {
                unit: true,
                invoiceItems: {
                    include: {
                        invoice: {
                            include: { provider: true }
                        }
                    }
                },
                conciliation: {
                    include: { bankMovement: true }
                }
            }
        })
        if (!payment) {
            return res.status(404).json({ error: 'Payment not found' })
        }
        res.json(payment)
    } catch (error) {
        console.error('Error fetching payment:', error)
        res.status(500).json({ error: 'Error fetching payment' })
    }
})

// POST create payment
router.post('/', async (req, res) => {
    try {
        const {
            unitId, paymentDate, sourceType, amountPaid,
            retefuenteApplied, reteicaApplied,
            bankPaymentMethod, transactionRef,
            invoiceAllocations, // Array of { invoiceId, amount } - OPTIONAL
            hasAuditIssue,      // Flag for date anomalies
            hasPendingInvoice,   // Flag for no invoice selected
            pilaFileUrl,         // PDF de la PILA
            observations, referenceNumber, bankName, accountType,
            elaboratedBy, reviewedBy, approvedBy
        } = req.body

        if (!unitId || !paymentDate || !sourceType || !amountPaid) {
            return res.status(400).json({
                error: 'unitId, paymentDate, sourceType, and amountPaid are required'
            })
        }

        // Calculate net value
        const netValue = Number(amountPaid) - Number(retefuenteApplied || 0) - Number(reteicaApplied || 0)

        // Determine consecutive number
        let consecutiveNumber = null
        let finalManualConsecutive = null

        if (sourceType === 'INTERNAL') {
            const unit = await prisma.unit.findUnique({ where: { id: unitId } })
            if (!unit) {
                return res.status(400).json({ error: 'Unit not found' })
            }
            consecutiveNumber = unit.consecutiveSeed

            // Update seed for next payment
            await prisma.unit.update({
                where: { id: unitId },
                data: { consecutiveSeed: unit.consecutiveSeed + 1 }
            })
        } else if (sourceType === 'EXTERNAL') {
            // Validate manual consecutive
            if (!req.body.manualConsecutive) {
                return res.status(400).json({ error: 'El número de comprobante es requerido para pagos externos' })
            }

            // Check uniqueness
            const existing = await prisma.payment.findFirst({
                where: {
                    unitId,
                    manualConsecutive: req.body.manualConsecutive,
                    sourceType: 'EXTERNAL'
                }
            })

            if (existing) {
                return res.status(400).json({ error: `Ya existe un comprobante externo con el número ${req.body.manualConsecutive}` })
            }

            finalManualConsecutive = req.body.manualConsecutive
        }

        // Determine if payment has pending invoice (no allocations)
        const isPendingInvoice = hasPendingInvoice || !invoiceAllocations || invoiceAllocations.length === 0

        // Create payment with invoice allocations
        if (isFutureDate(paymentDate)) {
            return res.status(400).json({ error: 'La fecha de pago no puede ser futura.' })
        }

        const payment = await prisma.$transaction(async (tx) => {
            const newPayment = await tx.payment.create({
                data: {
                    unitId,
                    consecutiveNumber,
                    manualConsecutive: finalManualConsecutive,
                    paymentDate: new Date(paymentDate),
                    sourceType,
                    amountPaid,
                    retefuenteApplied: retefuenteApplied || 0,
                    reteicaApplied: reteicaApplied || 0,
                    netValue,
                    bankPaymentMethod,
                    transactionRef,
                    supportFileUrl: req.body.supportFileUrl,
                    pilaFileUrl,
                    status: isPendingInvoice ? 'DRAFT' : (sourceType === 'INTERNAL' ? 'COMPLETED' : 'PAID_NO_SUPPORT'),
                    hasAuditIssue: hasAuditIssue || false,
                    hasPendingInvoice: isPendingInvoice,
                    observations: observations || null,
                    referenceNumber: referenceNumber || null,
                    bankName: bankName || null,
                    accountType: accountType || null,
                    elaboratedBy: elaboratedBy || null,
                    reviewedBy: reviewedBy || null,
                    approvedBy: approvedBy || null,
                    invoiceItems: invoiceAllocations && invoiceAllocations.length > 0 ? {
                        create: invoiceAllocations.map((alloc: any) => ({
                            invoiceId: alloc.invoiceId,
                            amountApplied: alloc.amount
                        }))
                    } : undefined
                },
                include: {
                    invoiceItems: {
                        include: {
                            invoice: { include: { provider: true } }
                        }
                    }
                }
            })

            // Create audit log entries if there are issues
            if (hasAuditIssue) {
                await tx.auditLog.create({
                    data: {
                        unitId,
                        entityType: 'PAYMENT',
                        entityId: newPayment.id,
                        issueType: 'DATE_BEFORE_INVOICE',
                        description: `Pago ${consecutiveNumber ? 'CE-' + consecutiveNumber : newPayment.id} tiene fecha anterior a la factura asociada`
                    }
                })
            }

            if (isPendingInvoice) {
                await tx.auditLog.create({
                    data: {
                        unitId,
                        entityType: 'PAYMENT',
                        entityId: newPayment.id,
                        issueType: 'NO_INVOICE',
                        description: `Pago ${consecutiveNumber ? 'CE-' + consecutiveNumber : newPayment.id} creado sin factura asociada`
                    }
                })
            }

            // Update invoice statuses
            if (invoiceAllocations && invoiceAllocations.length > 0) {
                for (const alloc of invoiceAllocations) {
                    await updateInvoiceStatus(alloc.invoiceId)
                }
            }

            // Resequence consecutives based on payment dates
            await resequencePaymentConsecutives(unitId)

            return newPayment
        })

        res.status(201).json(payment)
    } catch (error) {
        console.error('Error creating payment:', error)
        res.status(500).json({ error: 'Error creating payment' })
    }
})

// Helper function to update invoice status based on payments
async function updateInvoiceStatus(invoiceId: string) {
    const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: { paymentItems: true }
    })

    if (!invoice) return

    const totalPaid = invoice.paymentItems.reduce((sum, pi) => sum + Number(pi.amountApplied), 0)
    const totalAmount = Number(invoice.totalAmount)

    let newStatus = 'PENDING'
    if (totalPaid >= totalAmount) {
        newStatus = 'PAID'
    } else if (totalPaid > 0) {
        newStatus = 'PARTIALLY_PAID'
    }

    await prisma.invoice.update({
        where: { id: invoiceId },
        data: { status: newStatus }
    })
}

// Helper to check if a date is in the future
function isFutureDate(date: Date | string) {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const checkDate = new Date(date);
    return checkDate > today;
}

// Helper function to resequence consecutive numbers based on payment dates
// Only affects INTERNAL payments that are not closed (no monthlyReportId)
export async function resequencePaymentConsecutives(unitId: string) {
    const unit = await prisma.unit.findUnique({
        where: { id: unitId },
        select: { consecutiveSeed: true }
    })
    if (!unit) return

    const frozenMaxResult = await prisma.payment.aggregate({
        where: {
            unitId,
            sourceType: 'INTERNAL',
            monthlyReportId: { not: null }
        },
        _max: { consecutiveNumber: true }
    })
    const frozenMax = frozenMaxResult._max.consecutiveNumber || 0

    const payments = await prisma.payment.findMany({
        where: {
            unitId,
            sourceType: 'INTERNAL',
            monthlyReportId: null
        },
        orderBy: [
            { paymentDate: 'asc' },
            { createdAt: 'asc' }
        ]
    })

    // STARTING POINT: The user-defined seed if valid, otherwise current sequence start or frozenMax + 1.
    let currentNumber = (payments[0]?.consecutiveNumber ?? (frozenMax + 1))

    // Relocation Support: If the user manually set a seed DIFFERENT than our current 
    // block start, they likely want to relocate the whole sequence to that point.
    // We only allow this if it's above the frozen (closed) period.
    if (unit.consecutiveSeed > frozenMax && unit.consecutiveSeed !== currentNumber) {
        currentNumber = unit.consecutiveSeed
    }

    // Determine shift direction to avoid Unique Constraint Collisions
    // If we are shifting UP (e.g. 1, 2, 3 -> 2, 3, 4), we must process in REVERSE (3->4, then 2->3, then 1->2)
    // If we are shifting DOWN, we process normally (1->0, 2->1...)
    const firstPayment = payments[0]
    const isShiftingUp = firstPayment && currentNumber > (firstPayment.consecutiveNumber || 0)

    // SAFE UPDATE ALGORITHM
    const procesablePayments = isShiftingUp ? [...payments].reverse() : payments

    // We need to map the TARGET number for each payment based on its index
    // If shifting UP (Reverse):
    //   Original: [P1(1), P2(2), P3(3)] -> Target Start: 2
    //   Reverse Loop: 
    //     P3(3) -> Target: 2 + 2 = 4. Update 3 to 4. OK.
    //     P2(2) -> Target: 2 + 1 = 3. Update 2 to 3. OK.
    //     P1(1) -> Target: 2 + 0 = 2. Update 1 to 2. OK.

    // If shifting DOWN (Normal):
    //   Original: [P1(2), P2(3)] -> Target Start: 1
    //   Normal Loop:
    //     P1(2) -> Target: 1 + 0 = 1. Update 2 to 1. OK.
    //     P2(3) -> Target: 1 + 1 = 2. Update 3 to 2. OK.

    for (let i = 0; i < procesablePayments.length; i++) {
        const p = procesablePayments[i]

        // Calculate the target relative index
        // If normal: index is i
        // If reverse: index is (length - 1) - i
        const originalIndex = isShiftingUp ? (procesablePayments.length - 1) - i : i
        const targetNumber = currentNumber + originalIndex

        if (p.consecutiveNumber !== targetNumber) {
            await prisma.payment.update({
                where: { id: p.id },
                data: { consecutiveNumber: targetNumber }
            })
        }
    }

    // Update the unit seed to the NEXT available number ONLY if it is 
    // too low (would cause collision). This respects manual GAPS set by the user.
    const lastNumber = currentNumber + payments.length
    if (unit.consecutiveSeed < lastNumber) {
        await prisma.unit.update({
            where: { id: unitId },
            data: { consecutiveSeed: lastNumber }
        })
    }
}

// PUT update payment - full edit support
router.put('/:id', async (req, res) => {
    try {
        if (req.body.paymentDate && isFutureDate(req.body.paymentDate)) {
            return res.status(400).json({ error: 'La fecha de pago no puede ser futura.' })
        }
        const {
            consecutiveNumber, supportFileUrl, status,
            bankPaymentMethod, transactionRef,
            paymentDate, amountPaid, retefuenteApplied, reteicaApplied,
            invoiceAllocations, manualConsecutive, sourceType,
            pilaFileUrl,
            observations, referenceNumber, bankName, accountType,
            elaboratedBy, reviewedBy, approvedBy
        } = req.body

        const paymentId = req.params.id

        // Get existing payment with its invoice items
        const existingPayment = await prisma.payment.findUnique({
            where: { id: paymentId },
            include: { invoiceItems: true }
        })

        if (!existingPayment) {
            return res.status(404).json({ error: 'Payment not found' })
        }

        // Build update data
        const updateData: any = {}
        if (consecutiveNumber !== undefined) updateData.consecutiveNumber = consecutiveNumber
        if (supportFileUrl !== undefined) updateData.supportFileUrl = supportFileUrl
        if (pilaFileUrl !== undefined) updateData.pilaFileUrl = pilaFileUrl
        if (status) updateData.status = status
        if (sourceType) updateData.sourceType = sourceType
        if (bankPaymentMethod !== undefined) updateData.bankPaymentMethod = bankPaymentMethod
        if (transactionRef !== undefined) updateData.transactionRef = transactionRef

        // Dynamic Receipt Fields
        if (observations !== undefined) updateData.observations = observations
        if (referenceNumber !== undefined) updateData.referenceNumber = referenceNumber
        if (bankName !== undefined) updateData.bankName = bankName
        if (accountType !== undefined) updateData.accountType = accountType
        if (elaboratedBy !== undefined) updateData.elaboratedBy = elaboratedBy
        if (reviewedBy !== undefined) updateData.reviewedBy = reviewedBy
        if (approvedBy !== undefined) updateData.approvedBy = approvedBy

        // Handle manual consecutive update for EXTERNAL payments
        if (manualConsecutive && (sourceType === 'EXTERNAL' || existingPayment.sourceType === 'EXTERNAL')) {
            // If manualConsecutive is provided, always update it if it is different or just update it
            // Check uniqueness if changed or if switching to EXTERNAL
            const targetSource = sourceType || existingPayment.sourceType

            if (targetSource === 'EXTERNAL') {
                if (manualConsecutive !== existingPayment.manualConsecutive) {
                    const existing = await prisma.payment.findFirst({
                        where: {
                            unitId: existingPayment.unitId,
                            manualConsecutive: manualConsecutive,
                            sourceType: 'EXTERNAL',
                            id: { not: paymentId }
                        }
                    })
                    if (existing) {
                        return res.status(400).json({ error: `Ya existe un comprobante externo con el número ${manualConsecutive}` })
                    }
                }
                updateData.manualConsecutive = manualConsecutive
            }
        }
        if (paymentDate) updateData.paymentDate = new Date(paymentDate)
        if (amountPaid !== undefined) {
            updateData.amountPaid = amountPaid
            // Recalculate netValue
            const reteF = retefuenteApplied !== undefined ? retefuenteApplied : Number(existingPayment.retefuenteApplied)
            const reteI = reteicaApplied !== undefined ? reteicaApplied : Number(existingPayment.reteicaApplied)
            updateData.netValue = amountPaid - reteF - reteI
        }
        if (retefuenteApplied !== undefined) updateData.retefuenteApplied = retefuenteApplied
        if (reteicaApplied !== undefined) updateData.reteicaApplied = reteicaApplied

        // If support file is provided (or consecutive number is provided), mark as COMPLETED
        // Bug fix: previously required BOTH consecutiveNumber AND supportFileUrl; now either is enough
        if (supportFileUrl || (consecutiveNumber && !existingPayment.supportFileUrl)) {
            updateData.status = 'COMPLETED'
        }

        // Handle invoice allocations if provided
        if (invoiceAllocations !== undefined) {
            // Get old invoice IDs to update their status after
            const oldInvoiceIds = existingPayment.invoiceItems.map(pi => pi.invoiceId)

            // Delete existing allocations
            await prisma.paymentInvoice.deleteMany({
                where: { paymentId }
            })

            // Create new allocations if any
            if (invoiceAllocations && invoiceAllocations.length > 0) {
                await prisma.paymentInvoice.createMany({
                    data: invoiceAllocations.map((alloc: any) => ({
                        paymentId,
                        invoiceId: alloc.invoiceId,
                        amountApplied: alloc.amount
                    }))
                })
                updateData.hasPendingInvoice = false
            } else {
                updateData.hasPendingInvoice = true
            }

            // Update old invoice statuses
            for (const invoiceId of oldInvoiceIds) {
                await updateInvoiceStatus(invoiceId)
            }

            // Update new invoice statuses
            if (invoiceAllocations) {
                for (const alloc of invoiceAllocations) {
                    await updateInvoiceStatus(alloc.invoiceId)
                }
            }
        } else if (supportFileUrl !== undefined) {
            // Bug fix: when only the support file is uploaded (no invoiceAllocations change),
            // we still need to recalculate the status of all already-associated invoices
            // because having a support file can now trigger COMPLETED status on the payment,
            // which should be reflected on the linked invoices.
            const currentItems = await prisma.paymentInvoice.findMany({
                where: { paymentId }
            })
            for (const item of currentItems) {
                await updateInvoiceStatus(item.invoiceId)
            }
        }

        const payment = await prisma.payment.update({
            where: { id: paymentId },
            data: updateData,
            include: {
                invoiceItems: {
                    include: {
                        invoice: { include: { provider: true } }
                    }
                }
            }
        })

        // Resequence consecutives if date changed
        await resequencePaymentConsecutives(existingPayment.unitId)

        res.json(payment)
    } catch (error) {
        console.error('Error updating payment:', error)
        res.status(500).json({ error: 'Error updating payment' })
    }
})

// POST link invoice to pending payment
router.post('/:id/link-invoice', async (req, res) => {
    try {
        const { invoiceId, amount } = req.body
        const paymentId = req.params.id

        if (!invoiceId || !amount) {
            return res.status(400).json({ error: 'invoiceId and amount are required' })
        }

        // Check if payment exists and has pending invoice flag
        const payment = await prisma.payment.findUnique({
            where: { id: paymentId },
            include: { invoiceItems: true }
        })

        if (!payment) {
            return res.status(404).json({ error: 'Payment not found' })
        }

        // Create the invoice allocation
        await prisma.paymentInvoice.create({
            data: {
                paymentId,
                invoiceId,
                amountApplied: amount
            }
        })

        // Update payment to remove pending invoice flag and update status
        await prisma.payment.update({
            where: { id: paymentId },
            data: {
                hasPendingInvoice: false,
                status: payment.sourceType === 'INTERNAL' ? 'COMPLETED' : 'PAID_NO_SUPPORT'
            }
        })

        // Resolve audit log if exists
        await prisma.auditLog.updateMany({
            where: {
                entityId: paymentId,
                issueType: 'NO_INVOICE',
                resolved: false
            },
            data: { resolved: true }
        })

        // Update invoice status
        await updateInvoiceStatus(invoiceId)

        res.json({ success: true })
    } catch (error) {
        console.error('Error linking invoice:', error)
        res.status(500).json({ error: 'Error linking invoice' })
    }
})

// DELETE payment
router.delete('/:id', async (req, res) => {
    try {
        const payment = await prisma.payment.findUnique({
            where: { id: req.params.id },
            include: { conciliation: true, invoiceItems: true }
        })

        if (payment?.conciliation) {
            return res.status(400).json({
                error: 'No se puede eliminar un pago conciliado'
            })
        }

        // Get affected invoices before deleting
        const invoiceIds = payment?.invoiceItems.map(pi => pi.invoiceId) || []

        // Delete payment items first, then payment
        await prisma.paymentInvoice.deleteMany({
            where: { paymentId: req.params.id }
        })
        await prisma.payment.delete({
            where: { id: req.params.id }
        })

        // Update invoice statuses
        for (const invoiceId of invoiceIds) {
            await updateInvoiceStatus(invoiceId)
        }

        // Resequence consecutives to fill gaps
        if (payment?.unitId) {
            await resequencePaymentConsecutives(payment.unitId)
        }

        res.json({ success: true })
    } catch (error) {
        console.error('Error deleting payment:', error)
        res.status(500).json({ error: 'Error deleting payment' })
    }
})

// GET next consecutive number for a unit
router.get('/next-consecutive/:unitId', async (req, res) => {
    try {
        const unit = await prisma.unit.findUnique({
            where: { id: req.params.unitId }
        })
        if (!unit) {
            return res.status(404).json({ error: 'Unit not found' })
        }
        res.json({ nextConsecutive: unit.consecutiveSeed })
    } catch (error) {
        console.error('Error fetching next consecutive:', error)
        res.status(500).json({ error: 'Error fetching consecutive' })
    }
})

export default router
