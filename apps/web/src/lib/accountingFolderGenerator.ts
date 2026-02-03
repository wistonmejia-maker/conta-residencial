import { PDFDocument, rgb, StandardFonts, degrees, PageSizes } from 'pdf-lib'
import { createPaymentReceiptDoc } from './pdfGenerator'
import type { Payment } from './api'

// Helper to check if buffer is PDF
const isPdfFile = (buffer: Uint8Array) => {
    const header = new Uint8Array(buffer.slice(0, 5))
    return String.fromCharCode(...header) === '%PDF-'
}

const STAMP_MARGIN = 40 // Reserved bottom area for stamps (~1.4cm)

// Helper to draw watermark at the visual bottom center, handling page rotation
const drawBottomWatermark = (page: any, text: string, font: any, size: number) => {
    const { width, height } = page.getSize()
    const rotation = page.getRotation().angle
    const textWidth = font.widthOfTextAtSize(text, size)
    const margin = STAMP_MARGIN / 2

    let x = (width - textWidth) / 2
    let y = margin

    if (rotation === 90) {
        x = width - margin
        y = (height - textWidth) / 2
    } else if (rotation === 180) {
        x = (width + textWidth) / 2
        y = height - margin
    } else if (rotation === 270) {
        x = margin
        y = (height + textWidth) / 2
    }

    page.drawText(text, {
        x,
        y,
        size,
        font,
        color: rgb(0.8, 0, 0),
        rotate: degrees(rotation)
    })
}

/**
 * Rescales a source page into a new Letter size page, leaving STAMP_MARGIN at the bottom.
 */
const rescaleAndPasteIntoLetter = async (mergedPdf: PDFDocument, sourcePdf: PDFDocument, sourcePageIndex: number) => {
    const [letterWidth, letterHeight] = PageSizes.Letter
    const newPage = mergedPdf.addPage([letterWidth, letterHeight])

    // Embed the source page
    const [embeddedPage] = await mergedPdf.embedPages([sourcePdf.getPage(sourcePageIndex)])

    // Calculate safe draw area
    const horizontalPadding = 40
    const topPadding = 40
    const bottomPadding = STAMP_MARGIN + 10 // Reserve space for stamp + extra gap

    const availableWidth = letterWidth - (horizontalPadding * 2)
    const availableHeight = letterHeight - topPadding - bottomPadding

    const scale = Math.min(
        availableWidth / embeddedPage.width,
        availableHeight / embeddedPage.height
    )

    const drawWidth = embeddedPage.width * scale
    const drawHeight = embeddedPage.height * scale

    newPage.drawPage(embeddedPage, {
        x: (letterWidth - drawWidth) / 2,
        y: bottomPadding + (availableHeight - drawHeight) / 2, // Centered in safe area
        width: drawWidth,
        height: drawHeight
    })

    return newPage
}

const embedImageToPdf = async (pdfDoc: PDFDocument, imageBytes: ArrayBuffer, type: 'png' | 'jpg', watermarkText?: string) => {
    let image
    try {
        if (type === 'png') image = await pdfDoc.embedPng(imageBytes)
        else image = await pdfDoc.embedJpg(imageBytes)
    } catch (e) {
        console.error('Error embedding image:', e)
        return
    }

    const [letterWidth, letterHeight] = PageSizes.Letter
    const page = pdfDoc.addPage([letterWidth, letterHeight])

    // Scale image to fit within margins
    const margin = 40
    const maxWidth = letterWidth - (margin * 2)
    // Reserve bottom space for watermark text
    const maxHeight = letterHeight - (margin * 2) - STAMP_MARGIN

    const imgDims = image.scale(1)
    let scale = 1

    if (imgDims.width > maxWidth || imgDims.height > maxHeight) {
        scale = Math.min(maxWidth / imgDims.width, maxHeight / imgDims.height)
    }

    const displayWidth = imgDims.width * scale
    const displayHeight = imgDims.height * scale

    // Draw image centered, but strictly above the bottom stamp area
    page.drawImage(image, {
        x: (letterWidth - displayWidth) / 2,
        y: STAMP_MARGIN + ((letterHeight - STAMP_MARGIN - displayHeight) / 2),
        width: displayWidth,
        height: displayHeight,
    })

    if (watermarkText) {
        const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
        drawBottomWatermark(page, watermarkText, font, 10)
    }
}



interface MonthlyReportData {
    unitName: string
    unitNit: string
    unitAddress?: string
    month: string
    year: string
    payments: (Payment & {
        provider?: {
            name: string;
            nit: string;
            dv: string;
            bankAccount?: string
        };
        invoiceItems?: Array<{
            amountApplied: number
            invoice: {
                invoiceNumber: string
                invoiceDate: string
                description?: string
                totalAmount: number
                fileUrl?: string // Original Invoice PDF URL
            }
        }>
        pilaFileUrl?: string    // PDF de la PILA
        supportFileUrl?: string // PDF del comprobante de pago
    })[]
    unitInfo: {
        name: string
        taxId: string
        address?: string
        logoUrl?: string
        defaultBankName?: string
        defaultAccountType?: string
        defaultElaboratedBy?: string
        defaultReviewedBy?: string
        defaultApprovedBy?: string
    }
    pendingInvoices?: Array<{
        invoiceNumber: string
        invoiceDate: string
        totalAmount: number
        balance?: number
        provider?: { name: string }
        fileUrl?: string
    }>
    skipInternalCE?: boolean
    includePila?: boolean
}

/**
 * Generates the "Carpeta Contable Mensual" PDF.
 * Structure:
 * 1. Cover Sheet (Month/Year check)
 * 2. For each payment:
 *    a. Payment Receipt (Generated CE) - SKIPPED if skipInternalCE is true
 *    b. Original Invoice (Attached if exists)
 *    c. Signed Payment Support (Attached if exists)
 *    d. Social Security (PILA) (Attached if exists and includePila is true)
 */
export async function generateAccountingFolder(data: MonthlyReportData): Promise<Uint8Array> {
    const mergedPdf = await PDFDocument.create()
    const [letterWidth, letterHeight] = PageSizes.Letter

    // 1. Cover Sheet
    const coverPage = mergedPdf.addPage([letterWidth, letterHeight])
    const width = letterWidth
    const height = letterHeight

    const font = await mergedPdf.embedFont(StandardFonts.HelveticaBold)
    const regularFont = await mergedPdf.embedFont(StandardFonts.Helvetica)

    // Draw Logo on cover if exists
    if (data.unitInfo.logoUrl) {
        try {
            const logoBytes = await fetch(data.unitInfo.logoUrl).then(res => res.arrayBuffer())
            // Simple type check from URL or default to png
            const isPng = data.unitInfo.logoUrl.toLowerCase().includes('.png')
            let logoImage
            if (isPng) logoImage = await mergedPdf.embedPng(logoBytes)
            else logoImage = await mergedPdf.embedJpg(logoBytes)

            const dims = logoImage.scale(0.5)
            coverPage.drawImage(logoImage, {
                x: (width - dims.width) / 2,
                y: height - 150,
                width: dims.width,
                height: dims.height,
            })
        } catch (e) {
            console.error('Error drawing logo on cover:', e)
        }
    }

    const titleY = data.unitInfo.logoUrl ? height - 300 : height - 100
    coverPage.drawText(data.unitName, { x: 50, y: titleY, size: 24, font })
    coverPage.drawText(`Carpeta Contable${data.skipInternalCE ? ' (Solo Soportes)' : ''} - ${data.month} ${data.year}`, { x: 50, y: titleY - 50, size: 18, font: regularFont })
    coverPage.drawText(`Generado: ${new Date().toLocaleDateString()}`, { x: 50, y: titleY - 80, size: 12, font: regularFont })

    // 2. Index Page (Relación de Documentos)
    const indexPage = mergedPdf.addPage([letterWidth, letterHeight])
    {
        indexPage.drawText('Relación de Documentos - Índice', { x: 50, y: height - 50, size: 16, font: await mergedPdf.embedFont(StandardFonts.HelveticaBold) })

        let y = height - 100
        const fontSize = 9
        const fontReg = await mergedPdf.embedFont(StandardFonts.Helvetica)
        const fontBold = await mergedPdf.embedFont(StandardFonts.HelveticaBold)

        // Headers
        indexPage.drawText('CE #', { x: 50, y, size: fontSize, font: fontBold })
        indexPage.drawText('Fecha', { x: 100, y, size: fontSize, font: fontBold })
        indexPage.drawText('Beneficiario', { x: 180, y, size: fontSize, font: fontBold })
        indexPage.drawText('Facturas', { x: 350, y, size: fontSize, font: fontBold })
        indexPage.drawText('Valor Total', { x: 500, y, size: fontSize, font: fontBold })

        y -= 20

        for (const p of data.payments) {
            if (y < 50) {
                // Simple pagination if needed, but rarely > 50 payments/month. 
                // For now let's just stop or add new page logic if easy. 
                // Keeping it simple for MVP.
            }

            const ceNum = p.consecutiveNumber ? `CE-${p.consecutiveNumber}` : 'EXT'
            const dateStr = new Date(p.paymentDate).toLocaleDateString()
            const providerName = p.provider?.name?.substring(0, 25) || 'N/A'
            const invoices = p.invoiceItems?.map(i => i.invoice.invoiceNumber).join(', ') || '-'
            const amount = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(p.amountPaid))

            indexPage.drawText(ceNum, { x: 50, y, size: fontSize, font: fontReg })
            indexPage.drawText(dateStr, { x: 100, y, size: fontSize, font: fontReg })
            indexPage.drawText(providerName, { x: 180, y, size: fontSize, font: fontReg })
            indexPage.drawText(invoices.substring(0, 20), { x: 350, y, size: fontSize, font: fontReg })
            indexPage.drawText(amount, { x: 500, y, size: fontSize, font: fontReg })

            y -= 15
        }

        // --- PENDING INVOICES SECTION ---
        if (data.pendingInvoices && data.pendingInvoices.length > 0) {
            y -= 30
            if (y < 100) {
                // Should add new page, but for MVP assuming fit
            }
            indexPage.drawText('Facturas Pendientes de Pago', { x: 50, y, size: 14, font: fontBold, color: rgb(0.8, 0, 0) })
            y -= 20

            // Headers
            indexPage.drawText('Fecha', { x: 50, y, size: fontSize, font: fontBold })
            indexPage.drawText('Proveedor', { x: 130, y, size: fontSize, font: fontBold })
            indexPage.drawText('Factura #', { x: 300, y, size: fontSize, font: fontBold })
            indexPage.drawText('Saldo Pendiente', { x: 450, y, size: fontSize, font: fontBold })
            y -= 20

            for (const inv of data.pendingInvoices) {
                const dateStr = new Date(inv.invoiceDate).toLocaleDateString()
                const providerName = inv.provider?.name?.substring(0, 30) || 'N/A'
                const amount = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(inv.balance || inv.totalAmount))

                indexPage.drawText(dateStr, { x: 50, y, size: fontSize, font: fontReg })
                indexPage.drawText(providerName, { x: 130, y, size: fontSize, font: fontReg })
                indexPage.drawText(inv.invoiceNumber, { x: 300, y, size: fontSize, font: fontReg })
                indexPage.drawText(amount, { x: 450, y, size: fontSize, font: fontReg })
                y -= 15
            }
        }
    }

    // 3. Iterate Payments & Attach
    // Sort by consecutive number
    const sortedPayments = [...data.payments].sort((a, b) =>
        (a.consecutiveNumber || 0) - (b.consecutiveNumber || 0)
    )

    for (const payment of sortedPayments) {
        // A. Generate Payment Receipt (CE)
        // Skip if skiptInternalCE is requested
        if (!data.skipInternalCE) {
            try {
                // Transform payment to ReceiptData format expected by pdfGenerator
                const receiptData = {
                    unitName: data.unitInfo.name,
                    unitNit: data.unitInfo.taxId,
                    unitAddress: data.unitInfo.address,
                    consecutiveNumber: payment.consecutiveNumber || 0,
                    paymentDate: payment.paymentDate,
                    providerName: payment.provider?.name || 'N/A',
                    providerNit: payment.provider?.nit || '',
                    providerDv: payment.provider?.dv || '',
                    invoices: (payment.invoiceItems || []).map(item => ({
                        invoiceNumber: item.invoice.invoiceNumber,
                        invoiceDate: item.invoice.invoiceDate,
                        description: item.invoice.description,
                        amount: Number(item.amountApplied)
                    })),
                    grossAmount: Number(payment.amountPaid),
                    retefuente: Number(payment.retefuenteApplied),
                    reteica: Number(payment.reteicaApplied),
                    netAmount: Number(payment.netValue),
                    paymentMethod: payment.bankPaymentMethod,
                    bankAccount: payment.provider?.bankAccount,
                    transactionRef: payment.transactionRef,
                    logoUrl: data.unitInfo.logoUrl,
                    // Dynamic Fields Mapping
                    observations: payment.observations,
                    referenceNumber: payment.referenceNumber,
                    bankName: payment.bankName || data.unitInfo.defaultBankName,
                    accountType: payment.accountType || data.unitInfo.defaultAccountType,
                    elaboratedBy: payment.elaboratedBy || data.unitInfo.defaultElaboratedBy,
                    reviewedBy: payment.reviewedBy || data.unitInfo.defaultReviewedBy,
                    approvedBy: payment.approvedBy || data.unitInfo.defaultApprovedBy
                }

                const doc = await createPaymentReceiptDoc(receiptData)
                const receiptPdfBytes = doc.output('arraybuffer')

                const receiptPdf = await PDFDocument.load(receiptPdfBytes)
                const pageIndices = receiptPdf.getPageIndices()

                for (const idx of pageIndices) {
                    await rescaleAndPasteIntoLetter(mergedPdf, receiptPdf, idx)
                }

            } catch (error) {
                console.error(`Error generating receipt for payment ${payment.consecutiveNumber}:`, error)
            }
        }

        // B. Attach Original Invoices
        const ceLabel = payment.consecutiveNumber ? `CE-${payment.consecutiveNumber}` : 'EXT'

        if (payment.invoiceItems) {
            for (const item of payment.invoiceItems) {
                if (item.invoice.fileUrl) {
                    const watermarkText = ceLabel
                    try {
                        const fileBytes = await fetch(item.invoice.fileUrl).then(res => res.arrayBuffer())
                        const uint8Bytes = new Uint8Array(fileBytes)

                        if (isPdfFile(uint8Bytes)) {
                            const invoicePdf = await PDFDocument.load(fileBytes)
                            const font = await mergedPdf.embedFont(StandardFonts.HelveticaBold)
                            const fontSize = 9

                            const pageIndices = invoicePdf.getPageIndices()
                            for (const idx of pageIndices) {
                                const newPage = await rescaleAndPasteIntoLetter(mergedPdf, invoicePdf, idx)
                                drawBottomWatermark(newPage, watermarkText, font, fontSize)
                            }

                        } else {
                            // Image
                            // Simple extension check or try-catch strategy
                            const url = item.invoice.fileUrl.toLowerCase()
                            const isPng = url.includes('.png')
                            const isJpg = url.includes('.jpg') || url.includes('.jpeg')

                            if (isPng) await embedImageToPdf(mergedPdf, fileBytes, 'png', watermarkText)
                            else if (isJpg) await embedImageToPdf(mergedPdf, fileBytes, 'jpg', watermarkText)
                            else await embedImageToPdf(mergedPdf, fileBytes, 'jpg', watermarkText) // Default
                        }
                    } catch (error) {
                        console.error('Error attaching invoice file:', error)
                    }
                }
            }
        }

        // C. Attach Signed Support
        if ((payment as any).supportFileUrl) {
            const watermarkText = ceLabel
            try {
                const fileBytes = await fetch((payment as any).supportFileUrl).then(res => res.arrayBuffer())
                const uint8Bytes = new Uint8Array(fileBytes)

                if (isPdfFile(uint8Bytes)) {
                    const supportPdf = await PDFDocument.load(fileBytes)
                    const font = await mergedPdf.embedFont(StandardFonts.HelveticaBold)
                    const fontSize = 9

                    const pageIndices = supportPdf.getPageIndices()
                    for (const idx of pageIndices) {
                        const newPage = await rescaleAndPasteIntoLetter(mergedPdf, supportPdf, idx)
                        drawBottomWatermark(newPage, watermarkText, font, fontSize)
                    }
                } else {
                    if (payment.supportFileUrl) {
                        const url = payment.supportFileUrl.toLowerCase()
                        const isPng = url.includes('.png')
                        const isJpg = url.includes('.jpg') || url.includes('.jpeg')

                        if (isPng) await embedImageToPdf(mergedPdf, fileBytes, 'png', watermarkText)
                        else if (isJpg) await embedImageToPdf(mergedPdf, fileBytes, 'jpg', watermarkText)
                        else await embedImageToPdf(mergedPdf, fileBytes, 'jpg', watermarkText)
                    }
                }
            } catch (error) {
                console.error('Error attaching support file:', error)
            }
        }

        // D. Attach PILA (Social Security)
        if (data.includePila && (payment as any).pilaFileUrl) {
            const watermarkText = "PILA " + ceLabel
            try {
                const fileBytes = await fetch((payment as any).pilaFileUrl).then(res => res.arrayBuffer())
                const uint8Bytes = new Uint8Array(fileBytes)

                if (isPdfFile(uint8Bytes)) {
                    const pilaPdf = await PDFDocument.load(fileBytes)
                    const font = await mergedPdf.embedFont(StandardFonts.HelveticaBold)
                    const fontSize = 9

                    const pageIndices = pilaPdf.getPageIndices()
                    for (const idx of pageIndices) {
                        const newPage = await rescaleAndPasteIntoLetter(mergedPdf, pilaPdf, idx)
                        drawBottomWatermark(newPage, watermarkText, font, fontSize)
                    }
                } else {
                    // Image
                    const url = ((payment as any).pilaFileUrl || '').toLowerCase()
                    const isPng = url.includes('.png')

                    if (isPng) await embedImageToPdf(mergedPdf, fileBytes, 'png', watermarkText)
                    else await embedImageToPdf(mergedPdf, fileBytes, 'jpg', watermarkText)
                }
            } catch (error) {
                console.error('Error attaching PILA file:', error)
            }
        }
    }

    // 4. Attach Pending Invoices
    if (data.pendingInvoices && data.pendingInvoices.length > 0) {
        for (const inv of data.pendingInvoices) {
            if (inv.fileUrl) {
                const watermarkText = "FACTURA PENDIENTE"
                try {
                    const fileBytes = await fetch(inv.fileUrl).then(res => res.arrayBuffer())
                    const uint8Bytes = new Uint8Array(fileBytes)

                    if (isPdfFile(uint8Bytes)) {
                        const invPdf = await PDFDocument.load(fileBytes)
                        const font = await mergedPdf.embedFont(StandardFonts.HelveticaBold)
                        const fontSize = 12

                        const pageIndices = invPdf.getPageIndices()
                        for (const idx of pageIndices) {
                            const newPage = await rescaleAndPasteIntoLetter(mergedPdf, invPdf, idx)
                            drawBottomWatermark(newPage, watermarkText, font, fontSize)
                        }
                    } else {
                        // Image
                        const url = inv.fileUrl.toLowerCase()
                        const isPng = url.includes('.png')
                        const isJpg = url.includes('.jpg') || url.includes('.jpeg')

                        if (isPng || isJpg) {
                            await embedImageToPdf(mergedPdf, fileBytes, isPng ? 'png' : 'jpg', watermarkText)
                        }
                    }
                } catch (err) {
                    console.error("Error attaching pending invoice", err)
                }
            }
        }
    }

    return await mergedPdf.save()
}
