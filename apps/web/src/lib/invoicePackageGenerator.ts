import { PDFDocument, rgb, StandardFonts, PageSizes } from 'pdf-lib'
import { 
    isPdfFile, 
    drawBottomWatermark, 
    splitTextIntoLines, 
    rescaleAndPasteIntoLetter, 
    embedImageToPdf 
} from './pdfUtils'

interface InvoicePackageData {
    unitName: string
    period?: string // e.g. "Marzo 2026"
    invoices: Array<{
        invoiceNumber: string
        invoiceDate: string
        provider?: { name: string }
        totalAmount: number
        fileUrl?: string
    }>
}

/**
 * Generates a consolidated PDF of all provided invoices.
 * Includes a cover sheet and an index.
 */
export async function generateInvoicePackage(data: InvoicePackageData): Promise<Uint8Array> {
    // 0. Filter invoices that actually have a file support to avoid blank sections/entries
    const invoicesWithFiles = data.invoices.filter(inv => !!inv.fileUrl)
    
    if (invoicesWithFiles.length === 0) {
        throw new Error('No se encontraron facturas con archivos adjuntos en la selección actual.')
    }

    const mergedPdf = await PDFDocument.create()
    const [letterWidth, letterHeight] = PageSizes.Letter
    const height = letterHeight

    const fontBold = await mergedPdf.embedFont(StandardFonts.HelveticaBold)
    const fontReg = await mergedPdf.embedFont(StandardFonts.Helvetica)

    // 1. Cover Sheet
    const coverPage = mergedPdf.addPage([letterWidth, letterHeight])
    const titleY = height - 150
    coverPage.drawText(data.unitName, { x: 50, y: titleY, size: 24, font: fontBold })
    coverPage.drawText(`Paquete de Soportes - Facturas (CxP)`, { x: 50, y: titleY - 40, size: 18, font: fontReg })
    if (data.period) {
        coverPage.drawText(`Periodo: ${data.period}`, { x: 50, y: titleY - 65, size: 14, font: fontReg })
    }
    coverPage.drawText(`Documentos con Soporte: ${invoicesWithFiles.length}`, { x: 50, y: titleY - 90, size: 12, font: fontReg })
    coverPage.drawText(`Generado: ${new Date().toLocaleDateString()}`, { x: 50, y: titleY - 110, size: 12, font: fontReg })

    // 2. Index Page
    let indexPage = mergedPdf.addPage([letterWidth, letterHeight])
    let y = height - 60
    indexPage.drawText('Relación de Facturas Contenidas', { x: 50, y, size: 16, font: fontBold })
    y -= 30

    // Table Headers
    const drawTableHeaders = (page: any, yPos: number) => {
        page.drawRectangle({ x: 40, y: yPos - 4, width: letterWidth - 80, height: 18, color: rgb(0.15, 0.15, 0.15) })
        const headers = [
            { text: 'Fecha', x: 50 },
            { text: 'Proveedor', x: 120 },
            { text: '# Factura', x: 350 },
            { text: 'Total', x: 500 }
        ]
        headers.forEach(h => page.drawText(h.text, { x: h.x, y: yPos, size: 9, font: fontBold, color: rgb(1, 1, 1) }))
    }

    drawTableHeaders(indexPage, y)
    y -= 20

    for (let i = 0; i < invoicesWithFiles.length; i++) {
        const inv = invoicesWithFiles[i]
        if (y < 60) {
            indexPage = mergedPdf.addPage([letterWidth, letterHeight])
            y = height - 60
            drawTableHeaders(indexPage, y)
            y -= 20
        }

        const dateStr = new Date(inv.invoiceDate).toLocaleDateString()
        const providerName = inv.provider?.name || 'N/A'
        const amountDisplay = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(inv.totalAmount)

        const providerLines = splitTextIntoLines(providerName, 220, fontReg, 9)
        const rowHeight = Math.max(providerLines.length * 12, 15)

        if (i % 2 === 1) {
            indexPage.drawRectangle({ x: 40, y: y - (rowHeight - 11), width: letterWidth - 80, height: rowHeight, color: rgb(0.97, 0.97, 0.97) })
        }

        indexPage.drawText(dateStr, { x: 50, y, size: 9, font: fontReg })
        providerLines.forEach((line, idx) => {
            indexPage.drawText(line, { x: 120, y: y - (idx * 12), size: 9, font: fontReg })
        })
        indexPage.drawText(inv.invoiceNumber, { x: 350, y, size: 9, font: fontReg })
        indexPage.drawText(amountDisplay, { x: 500, y, size: 9, font: fontReg })

        y -= rowHeight
    }

    // 3. Attach Files
    for (const inv of invoicesWithFiles) {
        if (!inv.fileUrl) continue;

        const watermarkText = `${inv.provider?.name || ''} - Factura ${inv.invoiceNumber}`
        
        try {
            const fileBytes = await fetch(inv.fileUrl).then(res => res.arrayBuffer())
            const uint8Bytes = new Uint8Array(fileBytes)

            if (isPdfFile(uint8Bytes)) {
                const sourcePdf = await PDFDocument.load(fileBytes)
                const pageIndices = sourcePdf.getPageIndices()
                for (const idx of pageIndices) {
                    const newPage = await rescaleAndPasteIntoLetter(mergedPdf, sourcePdf, idx)
                    drawBottomWatermark(newPage, watermarkText, fontBold, 8)
                }
            } else {
                // Image handling
                const url = inv.fileUrl.toLowerCase()
                const type = (url.includes('.png')) ? 'png' : 'jpg'
                await embedImageToPdf(mergedPdf, fileBytes, type, watermarkText)
            }
        } catch (error) {
            console.error(`Error attaching invoice ${inv.invoiceNumber}:`, error)
        }
    }

    return await mergedPdf.save()
}
