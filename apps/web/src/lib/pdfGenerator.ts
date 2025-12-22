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

    // Consecutive
    consecutiveNumber: number | null

    // Payment info
    paymentDate: string

    // Provider info
    providerName: string
    providerNit: string
    providerDv: string

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

const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })



export async function generatePaymentReceipt(data: PaymentReceiptData): Promise<void> {
    const doc = await createPaymentReceiptDoc(data)

    // Save the PDF
    const filename = data.consecutiveNumber
        ? `CE-${data.consecutiveNumber.toString().padStart(4, '0')}_${data.providerName.substring(0, 20).replace(/\s+/g, '_')}.pdf`
        : `Egreso_${data.paymentDate}_${data.providerName.substring(0, 20).replace(/\s+/g, '_')}.pdf`

    doc.save(filename)
}

export async function createPaymentReceiptDoc(data: PaymentReceiptData): Promise<jsPDF> {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()

    // Colors
    const primaryColor: [number, number, number] = [79, 70, 229] // Indigo-600
    const grayColor: [number, number, number] = [107, 114, 128] // Gray-500
    const darkColor: [number, number, number] = [17, 24, 39] // Gray-900

    // Header background
    doc.setFillColor(...primaryColor)
    doc.rect(0, 0, pageWidth, 35, 'F')

    // Logo (if available)
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
            // Draw logo on the left of header
            // Max height 25, max width 60
            doc.addImage(imgData, 'PNG', 10, 5, 25, 25, undefined, 'FAST')
        } catch (error) {
            console.error('Error adding logo to PDF:', error)
        }
    }

    // Header text
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.text('COMPROBANTE DE EGRESO', pageWidth / 2, 18, { align: 'center' })

    // Consecutive number
    doc.setFontSize(14)
    const consecutiveText = data.consecutiveNumber
        ? `CE-${data.consecutiveNumber.toString().padStart(4, '0')}`
        : 'EXTERNO (Sin CE)'
    doc.text(consecutiveText, pageWidth / 2, 28, { align: 'center' })

    // Unit info (left side)
    doc.setTextColor(...darkColor)
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text(data.unitName, 14, 50)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...grayColor)
    doc.text(`NIT: ${data.unitNit}`, 14, 56)
    if (data.unitAddress) {
        doc.text(data.unitAddress, 14, 62)
    }

    // Date (right side)
    doc.setTextColor(...darkColor)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('Fecha:', pageWidth - 60, 50)
    doc.setFont('helvetica', 'normal')
    doc.text(formatDate(data.paymentDate), pageWidth - 60, 56)

    // Separator line
    doc.setDrawColor(229, 231, 235)
    doc.setLineWidth(0.5)
    doc.line(14, 70, pageWidth - 14, 70)

    // Provider section
    let yPos = 80

    doc.setTextColor(...primaryColor)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('BENEFICIARIO', 14, yPos)

    yPos += 8
    doc.setTextColor(...darkColor)
    doc.setFontSize(12)
    doc.text(data.providerName, 14, yPos)

    yPos += 6
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...grayColor)
    doc.text(`NIT: ${data.providerNit}-${data.providerDv}`, 14, yPos)

    // Invoices Details Table
    yPos += 14
    doc.setTextColor(...primaryColor)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('DETALLE DE FACTURAS', 14, yPos)

    yPos += 5

    // Prepare table body based on invoices
    const invoiceRows = data.invoices.map(inv => [
        inv.invoiceNumber,
        formatDate(inv.invoiceDate),
        inv.description || '',
        formatMoney(inv.amount)
    ])

    // Calculate totals summary rows
    const summaryRows = []

    if (data.retefuente > 0) {
        summaryRows.push(['', '', '(-) Retención Fuente', `-${formatMoney(data.retefuente)}`])
    }
    if (data.reteica > 0) {
        summaryRows.push(['', '', '(-) Retención ICA', `-${formatMoney(data.reteica)}`])
    }

    summaryRows.push(['', '', 'TOTAL GIRADO', formatMoney(data.netAmount)])

    autoTable(doc, {
        startY: yPos,
        head: [['Número', 'Fecha', 'Concepto', 'Valor']],
        body: [...invoiceRows, ...summaryRows],
        theme: 'grid',
        headStyles: {
            fillColor: primaryColor,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            halign: 'center'
        },
        columnStyles: {
            0: { halign: 'left', cellWidth: 35 },
            1: { halign: 'center', cellWidth: 35 },
            2: { halign: 'left', cellWidth: 'auto' },
            3: { halign: 'right', cellWidth: 40 }
        },
        styles: {
            fontSize: 9,
            cellPadding: 4
        },
        willDrawCell: (hookData) => {
            // Style summary rows differently (no borders usually, or bold text)
            if (hookData.row.index >= invoiceRows.length) {
                if (hookData.column.index === 2) {
                    hookData.cell.styles.fontStyle = 'bold'
                    hookData.cell.styles.halign = 'right'
                }
                if (hookData.column.index === 3) {
                    hookData.cell.styles.fontStyle = 'bold'
                }

                // Highlight final total row
                if (hookData.row.index === invoiceRows.length + summaryRows.length - 1) {
                    hookData.cell.styles.fillColor = [236, 253, 245] // Green-50
                    hookData.cell.styles.textColor = [5, 150, 105] // Emerald-600
                    hookData.cell.styles.fontSize = 10
                }
            }
        }
    })

    // Payment method info
    yPos = (doc as any).lastAutoTable.finalY + 15

    if (data.paymentMethod || data.bankAccount || data.transactionRef) {
        doc.setTextColor(...primaryColor)
        doc.setFontSize(11)
        doc.setFont('helvetica', 'bold')
        doc.text('INFORMACIÓN DE PAGO', 14, yPos)

        yPos += 8
        doc.setTextColor(...darkColor)
        doc.setFontSize(10)
        doc.setFont('helvetica', 'normal')

        const paymentInfo: string[] = []
        if (data.paymentMethod) paymentInfo.push(`Método: ${data.paymentMethod}`)
        if (data.bankAccount) paymentInfo.push(`Cuenta: ${data.bankAccount}`)
        if (data.transactionRef) paymentInfo.push(`Ref. Transacción: ${data.transactionRef}`)

        doc.text(paymentInfo.join('  •  '), 14, yPos)
    }

    // Signatures area
    yPos = 240

    doc.setDrawColor(200, 200, 200)
    doc.setLineWidth(0.3)

    // Signature 1 - Prepared by
    doc.line(14, yPos, 80, yPos)
    doc.setFontSize(9)
    doc.setTextColor(...grayColor)
    doc.text('Elaboró', 47, yPos + 5, { align: 'center' })

    // Signature 2 - Approved by
    doc.line(90, yPos, 156, yPos)
    doc.text('Revisó', 123, yPos + 5, { align: 'center' })

    // Signature 3 - Received by
    doc.line(166, yPos, pageWidth - 14, yPos)
    doc.text('Recibí Conforme', (166 + pageWidth - 14) / 2, yPos + 5, { align: 'center' })

    // Footer
    const footerY = 280
    doc.setFontSize(8)
    doc.setTextColor(...grayColor)
    doc.text(
        `Generado el ${new Date().toLocaleDateString('es-CO')} a las ${new Date().toLocaleTimeString('es-CO')}`,
        pageWidth / 2,
        footerY,
        { align: 'center' }
    )
    doc.text(
        'ContaResidencial - Sistema de Gestión Administrativa',
        pageWidth / 2,
        footerY + 5,
        { align: 'center' }
    )

    return doc
}

// Generate receipt from payment data (helper for use with API response)
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
}) {
    // Map all invoice items
    const invoices: InvoiceInfo[] = (payment.invoiceItems || []).map(item => ({
        invoiceNumber: item.invoice.invoiceNumber,
        invoiceDate: item.invoice.invoiceDate,
        description: item.invoice.description,
        amount: Number(item.amountApplied) // Use amount applied in this payment, not total invoice amount
    }))

    await generatePaymentReceipt({
        unitName: unit.name,
        unitNit: unit.taxId,
        unitAddress: unit.address,
        consecutiveNumber: payment.consecutiveNumber,
        paymentDate: payment.paymentDate,
        providerName: payment.provider?.name || 'N/A',
        providerNit: payment.provider?.nit || '',
        providerDv: payment.provider?.dv || '',
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
