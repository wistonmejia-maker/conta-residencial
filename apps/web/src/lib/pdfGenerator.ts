import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

interface InvoiceInfo {
    invoiceNumber: string
    invoiceDate: string
    description?: string
    amount: number
}

interface PaymentReceiptData {
    // Unit info
    unitName: string
    unitNit: string
    unitAddress?: string
    unitCity?: string // Added

    // Consecutive
    consecutiveNumber: number | null

    // Payment info
    paymentDate: string

    // Provider info
    providerName: string
    providerNit: string
    providerDv: string
    providerCity?: string // Added
    providerPhone?: string // Added

    // Invoices list
    invoices: InvoiceInfo[]

    // Amounts
    grossAmount: number
    retefuente: number
    reteica: number
    netAmount: number

    // Payment method
    paymentMethod?: string
    bankAccount?: string
    transactionRef?: string

    // Logo
    logoUrl?: string
}

const formatMoney = (value: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value)

const formatDate = (dateStr: string) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`
}

// Simple Number to Words Converter for Spanish (Integers)
function numeroALetras(num: number): string {
    if (num === 0) return "CERO PESOS M/C";

    const unidades = ["", "UN ", "DOS ", "TRES ", "CUATRO ", "CINCO ", "SEIS ", "SIETE ", "OCHO ", "NUEVE "];
    const especiales = ["DIEZ ", "ONCE ", "DOCE ", "TRECE ", "CATORCE ", "QUINCE ", "DIECISEIS ", "DIECISIETE ", "DIECIOCHO ", "DIECINUEVE "];
    const decenas = ["", "DIEZ ", "VEINTE ", "TREINTA ", "CUARENTA ", "CINCUENTA ", "SESENTA ", "SETENTA ", "OCHENTA ", "NOVENTA "];
    const centenas = ["", "CIENTO ", "DOSCIENTOS ", "TRESCIENTOS ", "CUATROCIENTOS ", "QUINIENTOS ", "SEISCIENTOS ", "SETECIENTOS ", "OCHOCIENTOS ", "NOVECIENTOS "];

    let lyrics = "";
    let rest = Math.floor(num); // Handle integers for simplicity

    if (rest >= 1000000) {
        const millions = Math.floor(rest / 1000000);
        if (millions === 1) lyrics += "UN MILLON ";
        else lyrics += numeroALetras(millions).replace("PESOS M/C", "").replace("UN ", "UN") + " MILLONES ";
        rest = rest % 1000000;
    }

    if (rest >= 1000) {
        const thousands = Math.floor(rest / 1000);
        if (thousands === 1) lyrics += "MIL ";
        else lyrics += numeroALetras(thousands).replace("PESOS M/C", "").replace("UN ", "UN") + " MIL ";
        rest = rest % 1000;
    }

    if (rest >= 100) {
        if (rest === 100) {
            lyrics += "CIEN ";
            rest = 0;
        } else {
            lyrics += centenas[Math.floor(rest / 100)];
            rest = rest % 100;
        }
    }

    if (rest >= 20) {
        lyrics += decenas[Math.floor(rest / 10)];
        rest = rest % 10;
        if (rest > 0) lyrics = lyrics.trim() + " Y ";
    } else if (rest >= 10) {
        lyrics += especiales[rest - 10];
        rest = 0;
    }

    if (rest > 0) {
        lyrics += unidades[rest];
    }

    return (lyrics.trim() + " PESOS M/C").replace("  ", " ");
}

export async function generatePaymentReceipt(data: PaymentReceiptData): Promise<void> {
    const doc = await createPaymentReceiptDoc(data)

    // Save the PDF
    const filename = data.consecutiveNumber
        ? `CE-${data.consecutiveNumber.toString().padStart(4, '0')}_${data.providerName.substring(0, 20).replace(/\s+/g, '_')}.pdf`
        : `Egreso_${data.paymentDate}_${data.providerName.substring(0, 20).replace(/\s+/g, '_')}.pdf`

    doc.save(filename)
}

export async function openPaymentReceiptPreview(data: PaymentReceiptData): Promise<void> {
    const doc = await createPaymentReceiptDoc(data)
    window.open(doc.output('bloburl'), '_blank')
}

export async function createPaymentReceiptDoc(data: PaymentReceiptData): Promise<jsPDF> {
    const doc = new jsPDF()
    const width = doc.internal.pageSize.getWidth()
    const height = doc.internal.pageSize.getHeight()
    const margin = 10
    const contentWidth = width - (margin * 2)

    // --- UTILS ---
    const drawRect = (x: number, y: number, w: number, h: number, fill = false) => {
        doc.setDrawColor(0) // Black borders
        doc.setLineWidth(0.3)
        if (fill) {
            doc.setFillColor(230, 230, 230) // Light Gray
            doc.rect(x, y, w, h, 'FD')
        } else {
            doc.rect(x, y, w, h)
        }
    }

    const drawText = (text: string, x: number, y: number, size = 9, bold = false, align: 'left' | 'center' | 'right' = 'left') => {
        doc.setTextColor(0)
        doc.setFontSize(size)
        doc.setFont('helvetica', bold ? 'bold' : 'normal')
        doc.text(text, x, y, { align })
    }

    let y = margin

    // --- 1. HEADER (Logo | Info | Doc Num) ---
    const headerH = 25
    drawRect(margin, y, contentWidth, headerH) // Main Box

    // Logo (Left - 25% width)
    const logoW = 40
    doc.line(margin + logoW, y, margin + logoW, y + headerH) // Vertical Sep

    if (data.logoUrl) {
        try {
            const imgData = await new Promise<string>((resolve, reject) => {
                const img = new Image()
                img.crossOrigin = 'Anonymous'
                img.onload = () => {
                    const canvas = document.createElement('canvas')
                    canvas.width = img.width
                    canvas.height = img.height
                    const ctx = canvas.getContext('2d')
                    ctx?.drawImage(img, 0, 0)
                    resolve(canvas.toDataURL('image/png'))
                }
                img.onerror = reject
                img.src = data.logoUrl!
            })
            // Fit Logo
            doc.addImage(imgData, 'PNG', margin + 2, y + 2, logoW - 4, headerH - 4, undefined, 'NONE')
        } catch (error) {
            // Ignore
        }
    } else {
        drawText("LOGO", margin + (logoW / 2), y + (headerH / 2), 10, true, 'center')
    }

    // Doc Num (Right - 30mm)
    const docNumW = 40
    const docNumX = margin + contentWidth - docNumW
    doc.line(docNumX, y, docNumX, y + headerH) // Ver Sep

    drawText("Comprobante Egreso", docNumX + (docNumW / 2), y + 6, 8, false, 'center')
    drawText(data.consecutiveNumber ? `No. ${data.consecutiveNumber}` : "S/N", docNumX + (docNumW / 2), y + 16, 12, true, 'center')

    // Center Info (Unit Name, Nit, City)
    const centerX = margin + logoW + ((contentWidth - logoW - docNumW) / 2)
    drawText(data.unitName.toUpperCase(), centerX, y + 8, 11, true, 'center')
    drawText(`NIT: ${data.unitNit}`, centerX, y + 14, 9, false, 'center')
    drawText(data.unitCity || "Colombia", centerX, y + 20, 9, false, 'center')

    y += headerH + 2

    // --- 2. PROVIDER GRID ---
    const rowH = 7
    // Row 1
    drawRect(margin, y, contentWidth, rowH * 2) // Box for 2 rows
    doc.line(margin, y + rowH, margin + contentWidth, y + rowH) // Horizontal Split

    // Row 1 Cols: Proveedor (Auto) | Telefono (30) | Fecha (30)
    const colDateW = 35
    const colTelW = 35
    const colProvW = contentWidth - colDateW - colTelW

    // Vertical lines Row 1
    doc.line(margin + colProvW, y, margin + colProvW, y + rowH)
    doc.line(margin + colProvW + colTelW, y, margin + colProvW + colTelW, y + rowH)

    // Text Row 1
    drawText("Proveedor:", margin + 2, y + 5, 8, true)
    drawText(data.providerName.toUpperCase(), margin + 25, y + 5, 9, false)

    drawText("Teléfono:", margin + colProvW + 2, y + 5, 8, true)
    drawText(data.providerPhone || "", margin + colProvW + 20, y + 5, 9, false)

    drawText("Fecha Comprobante", margin + colProvW + colTelW + (colDateW / 2), y + 3, 7, true, 'center')
    drawText(formatDate(data.paymentDate), margin + colProvW + colTelW + (colDateW / 2), y + 6.5, 9, false, 'center')

    // Row 2: NIT | Ciudad | Date
    // Using same vertical lines logic roughly
    doc.line(margin + colProvW, y + rowH, margin + colProvW, y + (rowH * 2))
    doc.line(margin + colProvW + colTelW, y + rowH, margin + colProvW + colTelW, y + (rowH * 2))

    drawText("NIT.:", margin + 2, y + rowH + 5, 8, true)
    drawText(data.providerNit + (data.providerDv ? `-${data.providerDv}` : ''), margin + 25, y + rowH + 5, 9, false)

    drawText("Ciudad:", margin + colProvW + 2, y + rowH + 5, 8, true)
    drawText(data.providerCity || "", margin + colProvW + 20, y + rowH + 5, 9, false)

    // Date already in row 1 merged cell visual, but let's leave row 2 blank or repeat
    // The reference has a merged cell look for the Title "Fecha" and value.
    // My previous code put title top value bottom in Row 1.

    y += (rowH * 2) + 2

    // --- 3. DETAILS TABLE (CODIGO PUC | CONCEPTO | VALOR) ---
    // We use autoTable but styled to look like the grid
    const tableY = y

    // Prepare Data
    const bodyData = data.invoices.map(inv => [
        "2205", // Mock PUC
        `Pago Factura ${inv.invoiceNumber} - ${inv.description || 'Sin descripción'}`,
        formatMoney(inv.amount)
    ])

    // Add retentions
    if (data.retefuente > 0) bodyData.push(["2365", "RETENCION EN LA FUENTE", `(${formatMoney(data.retefuente)})`])
    if (data.reteica > 0) bodyData.push(["2368", "RETENCION ICA", `(${formatMoney(data.reteica)})`])

    // AutoTable
    autoTable(doc, {
        startY: tableY,
        head: [['CODIGO PUC', 'CONCEPTO', 'VALOR']],
        body: bodyData,
        theme: 'plain', // We want control
        styles: {
            fontSize: 9,
            cellPadding: 3,
            lineColor: 0,
            lineWidth: 0.1,
            textColor: 0
        },
        headStyles: {
            fillColor: [220, 220, 220], // Gray
            fontStyle: 'bold',
            halign: 'center',
            lineWidth: 0.3,
            lineColor: 0
        },
        columnStyles: {
            0: { cellWidth: 30, halign: 'center' },
            1: { cellWidth: 'auto' }, // Concepto
            2: { cellWidth: 40, halign: 'right' }
        },
        margin: { left: margin, right: margin }
    })

    y = (doc as any).lastAutoTable.finalY

    // --- 4. DETAILS FOOTER (Neto & Type) ---
    const footerH = 8
    drawRect(margin, y, contentWidth, footerH)
    doc.line(margin + 100, y, margin + 100, y + footerH) // Split Type | Net
    doc.line(margin + contentWidth - 40, y, margin + contentWidth - 40, y + footerH) // Split Label | Value

    drawText("Tipo de Pago:", margin + 2, y + 5.5, 9, true)
    drawText(data.paymentMethod === 'TRANSFER' ? 'Transferencia' : 'Efectivo/Cheque', margin + 30, y + 5.5, 9, false)

    drawText("Pago Neto:", margin + contentWidth - 42, y + 5.5, 9, true, 'right')
    drawText(formatMoney(data.netAmount), margin + contentWidth - 2, y + 5.5, 10, true, 'right')

    y += footerH + 2

    // --- 5. VALOR EN LETRAS & OBS ---
    const lettersH = 15
    drawRect(margin, y, contentWidth, lettersH)
    drawText("Valor en Letras:", margin + 2, y + 4, 8, true)
    drawText(numeroALetras(data.netAmount), margin + 2, y + 10, 9, false)

    y += lettersH
    const obsH = 15
    drawRect(margin, y, contentWidth, obsH)
    drawText("Observaciones:", margin + 2, y + 4, 8, true)
    if (data.transactionRef) {
        drawText(`Ref: ${data.transactionRef}`, margin + 2, y + 10, 9, false)
    }

    y += obsH + 5

    // --- 6. BANK & SIGNATURES GRID ---
    // Reference has a bottom block.
    // Row 1: Cheque | Efectivo | Firma
    // Row 2: Banco | Sucursal | (Space)
    // Row 3: Debitese | (Space)
    // Row 4: Signatures Labels
    // Row 5: Signatures Space

    const bankW = contentWidth * 0.6
    const signW = contentWidth - bankW

    // Bank Block
    drawRect(margin, y, bankW, 24) // 3 rows of 8
    // Horizontal Lines
    doc.line(margin, y + 8, margin + bankW, y + 8)
    doc.line(margin, y + 16, margin + bankW, y + 16)
    // Vertical Line split bank info labels
    doc.line(margin + 30, y, margin + 30, y + 24) // Labels width
    doc.line(margin + (bankW / 2), y, margin + (bankW / 2), y + 24) // Middle split

    // Labels
    drawText("Cheque No.", margin + 28, y + 5.5, 8, true, 'right')
    drawText("Banco:", margin + 28, y + 13.5, 8, true, 'right')
    drawText("Debítese a:", margin + 28, y + 21.5, 8, true, 'right')

    drawText("Efectivo:", margin + (bankW / 2) + 28, y + 5.5, 8, true, 'right')
    drawText("Sucursal:", margin + (bankW / 2) + 28, y + 13.5, 8, true, 'right')

    // Values (Mock or Real)
    drawText(data.transactionRef || "N/A", margin + 32, y + 5.5, 8)
    if (data.bankAccount) drawText(data.bankAccount, margin + 32, y + 21.5, 8)

    // Beneficiary Signature Block (Right)
    drawRect(margin + bankW, y, signW, 24)
    drawText("Firma y Sello del Beneficiario:", margin + bankW + 2, y + 5, 8, true)
    // Small grid at bottom of sign block
    const signGridY = y + 18
    const signGridH = 6
    doc.rect(margin + bankW, signGridY, signW, signGridH)
    doc.line(margin + bankW + (signW * 0.25), signGridY, margin + bankW + (signW * 0.25), signGridY + signGridH)
    doc.line(margin + bankW + (signW * 0.5), signGridY, margin + bankW + (signW * 0.5), signGridY + signGridH)
    doc.line(margin + bankW + (signW * 0.75), signGridY, margin + bankW + (signW * 0.75), signGridY + signGridH)

    drawText("C.C.", margin + bankW + 2, signGridY + 4, 7)
    drawText("NIT.", margin + bankW + (signW * 0.25) + 2, signGridY + 4, 7)

    y += 24

    // Signatures Bottom Row
    const sigH = 20
    drawRect(margin, y, contentWidth, 6, true) // Header Gray
    drawRect(margin, y + 6, contentWidth, sigH) // Body

    // 4 Columns
    const colSigW = contentWidth / 4
    for (let i = 1; i < 4; i++) {
        doc.line(margin + (colSigW * i), y, margin + (colSigW * i), y + 6 + sigH)
    }

    drawText("ELABORADO", margin + (colSigW * 0.5), y + 4.5, 8, true, 'center')
    drawText("REVISADO", margin + (colSigW * 1.5), y + 4.5, 8, true, 'center')
    drawText("APROBADO", margin + (colSigW * 2.5), y + 4.5, 8, true, 'center')
    drawText("CONTABILIZADO", margin + (colSigW * 3.5), y + 4.5, 8, true, 'center')

    // Add User Names if available or lines
    // y + 6 + sigH - 5

    // Footer Info
    const footerY = height - 10
    doc.setFontSize(7)
    doc.setTextColor(100)
    doc.text("Generado por ContaResidencial", margin, footerY)
    doc.text(`Impreso: ${new Date().toLocaleString()}`, width - margin, footerY, { align: 'right' })

    return doc
}

export async function generateReceiptFromPayment(payment: {
    consecutiveNumber: number | null
    paymentDate: string
    amountPaid: number
    retefuenteApplied: number
    reteicaApplied: number
    netValue: number
    bankPaymentMethod?: string
    transactionRef?: string
    provider?: {
        name: string
        nit: string
        dv: string
        bankAccount?: string
        city?: string
        phone?: string
    }
    invoiceItems?: Array<{
        amountApplied: number
        invoice: {
            invoiceNumber: string
            invoiceDate: string
            description?: string
            totalAmount: number
        }
    }>
}, unit: {
    name: string
    taxId: string
    address?: string
    logoUrl?: string
    city?: string
}) {
    // Map all invoice items
    const invoices: InvoiceInfo[] = (payment.invoiceItems || []).map(item => ({
        invoiceNumber: item.invoice.invoiceNumber,
        invoiceDate: item.invoice.invoiceDate,
        description: item.invoice.description,
        amount: Number(item.amountApplied)
    }))

    await generatePaymentReceipt({
        unitName: unit.name || 'Edificio',
        unitNit: unit.taxId || 'N/A',
        unitAddress: unit.address,
        unitCity: unit.city || 'Cali - Colombia', // Mock default or prop
        consecutiveNumber: payment.consecutiveNumber,
        paymentDate: payment.paymentDate,
        providerName: payment.provider?.name || 'N/A',
        providerNit: payment.provider?.nit || '',
        providerDv: payment.provider?.dv || '',
        providerCity: payment.provider?.city || 'Cali',
        providerPhone: payment.provider?.phone || '',
        invoices: invoices,
        grossAmount: Number(payment.amountPaid),
        retefuente: Number(payment.retefuenteApplied),
        reteica: Number(payment.reteicaApplied),
        netAmount: Number(payment.netValue),
        paymentMethod: payment.bankPaymentMethod,
        bankAccount: payment.provider?.bankAccount,
        transactionRef: payment.transactionRef,
        logoUrl: unit.logoUrl
    })
}
