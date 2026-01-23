import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Download, FolderDown, Brain, AlertOctagon, CheckCircle, TrendingUp, Calendar, Filter, Eye, Trash2, Upload, FileSpreadsheet, CheckCircle2, Briefcase, X, Loader2, AlertTriangle, Edit3, CreditCard } from 'lucide-react'
// ... (existing imports)

// ... (existing functions)


import * as XLSX from 'xlsx'
import { getPayments, getProviders, getInvoices, getReports, createReport, deleteReport, uploadFile, updatePayment } from '../lib/api'
import type { Payment, Provider, Invoice, MonthlyReport } from '../lib/api'
import { generateAccountingFolder } from '../lib/accountingFolderGenerator'
import { uploadFileToStorage } from '../lib/storage'
import { useUnit } from '../lib/UnitContext'
import { toast } from '../components/ui/Toast'
import { getAuditPreview } from '../lib/api/reports'
import { openPaymentReceiptPreview } from '../lib/pdfGenerator'
import { formatMoney } from '../lib/format'


const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('es-CO')

// Helper to open files in new tab with advanced handling for Cloudinary
const openFileUrl = async (url: string) => {
    if (!url) return;

    const isImage = /\.(png|jpg|jpeg|webp|gif|bmp)$/i.test(url) || url.includes('/image/upload/');

    // Handle Cloudinary RAW files or _secure bypass files
    if (!isImage && (url.includes('/raw/upload/') || url.endsWith('.pdf_secure') || !url.toLowerCase().endsWith('.pdf'))) {
        const newWindow = window.open('', '_blank');
        if (newWindow) {
            newWindow.document.write(`
                <html>
                    <head><title>Cargando documento...</title></head>
                    <body style="display:flex;justify-content:center;align-items:center;height:100vh;margin:0;font-family:sans-serif;background:#f3f4f6;">
                        <div style="text-align:center;">
                            <div style="margin-bottom:10px;">Cargando documento...</div>
                            <div style="font-size:12px;color:#6b7280;">Por favor espere</div>
                        </div>
                    </body>
                </html>
            `);

            try {
                const response = await fetch(url);
                const blob = await response.blob();
                const pdfBlob = new Blob([blob], { type: 'application/pdf' });
                const pdfUrl = URL.createObjectURL(pdfBlob);
                newWindow.location.href = pdfUrl;
            } catch (error) {
                newWindow.close();
                console.error('Error opening PDF:', error);
                window.open(url, '_blank'); // Fallback
            }
        } else {
            window.open(url, '_blank'); // Fallback if popup blocked
        }
        return;
    }

    window.open(url, '_blank');
};

// Get current month start/end
const getMonthRange = (monthsAgo = 0) => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1)
    const end = new Date(now.getFullYear(), now.getMonth() - monthsAgo + 1, 0)
    return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0]
    }
}

export default function MonthlyClosurePage() {
    const { selectedUnit } = useUnit()
    const unitId = selectedUnit?.id || ''
    const queryClient = useQueryClient()

    const currentMonth = getMonthRange(0)
    const [dateFrom, setDateFrom] = useState(currentMonth.start)
    const [dateTo, setDateTo] = useState(currentMonth.end)
    const [selectedProvider, setSelectedProvider] = useState<string>('')
    const [generating, setGenerating] = useState(false)
    const [validationErrors, setValidationErrors] = useState<string[]>([])
    const [showValidationModal, setShowValidationModal] = useState(false)
    const [uploadingPilaId, setUploadingPilaId] = useState<string | null>(null)

    // History Tab State
    const [activeTab, setActiveTab] = useState<'generate' | 'history' | 'audit'>('generate')
    const [selectedReport, setSelectedReport] = useState<MonthlyReport | null>(null)

    // AI Audit State
    const { data: auditData, isLoading: isLoadingAudit } = useQuery({
        queryKey: ['audit-preview', unitId, dateFrom],
        queryFn: () => {
            const date = new Date(dateFrom)
            return getAuditPreview(unitId, date.getMonth() + 1, date.getFullYear())
        },
        enabled: activeTab === 'audit' && !!unitId
    })

    const { data: historyReports, refetch: refetchHistory } = useQuery({
        queryKey: ['reports', unitId],
        queryFn: () => getReports(unitId),
        enabled: !!unitId
    })

    const handleCloseMonth = async () => {
        // Filter to only unreported payments
        const unreportedPayments = filteredPayments.filter(p => !p.monthlyReportId)

        // Check for payments with pending invoices - block closure
        const paymentsWithPendingInvoice = unreportedPayments.filter(p => p.hasPendingInvoice)
        if (paymentsWithPendingInvoice.length > 0) {
            const ceList = paymentsWithPendingInvoice.map(p => p.consecutiveNumber ? `CE-${p.consecutiveNumber}` : p.id).join(', ')
            alert(`No se puede cerrar el mes. Hay ${paymentsWithPendingInvoice.length} pago(s) sin factura asociada:\n${ceList}\n\nDebe completar o eliminar estos pagos antes de cerrar.`)
            return
        }

        // Get invoice IDs from the payments' invoiceItems (paid invoices)
        const allInvoiceIds = new Set<string>()
        unreportedPayments.forEach(p => {
            if ((p as any).invoiceItems && (p as any).invoiceItems.length > 0) {
                (p as any).invoiceItems.forEach((item: any) => {
                    if (!item.invoice?.monthlyReportId) {
                        allInvoiceIds.add(item.invoice.id)
                    }
                })
            }
        })

        // Also add pending invoices (same as folder generator)
        const unreportedPendingInvoices = pendingInvoices.filter(inv => !inv.monthlyReportId)
        unreportedPendingInvoices.forEach(inv => allInvoiceIds.add(inv.id))

        // Validate there's unreported data to close
        if (unreportedPayments.length === 0 && unreportedPendingInvoices.length === 0) {
            alert('No hay pagos ni facturas pendientes SIN REPORTAR para cerrar en este período.')
            return
        }

        if (!confirm(`¿Estás seguro de cerrar este mes? Se incluirán ${unreportedPayments.length} pago(s) y ${allInvoiceIds.size} factura(s) (pagadas + pendientes).`)) return

        setGenerating(true)
        try {
            // Use 12:00 to avoid timezone issues
            const reportDate = new Date(dateFrom + 'T12:00:00')
            const monthName = reportDate.toLocaleString('es-CO', { month: 'long' })
            const yearVal = reportDate.getFullYear().toString()

            // Generate monthly folder PDF (same as handleGenerateFolder)
            const pdfBytes = await generateAccountingFolder({
                unitName: selectedUnit?.name || "Unidad",
                unitNit: selectedUnit?.taxId || "N/A",
                unitAddress: selectedUnit?.address || "Sin dirección",
                month: monthName,
                year: yearVal,
                payments: unreportedPayments as any,
                pendingInvoices: pendingInvoices as any,
                unitInfo: {
                    name: selectedUnit?.name || "Unidad",
                    taxId: selectedUnit?.taxId || "N/A",
                    address: selectedUnit?.address || "Sin dirección",
                    logoUrl: selectedUnit?.logoUrl
                },
                includePila: true
            })

            // Upload PDF to storage
            const filename = `Carpeta_${monthName}_${yearVal}_${Date.now()}.pdf`
            const pdfFile = new File([pdfBytes as unknown as BlobPart], filename, { type: 'application/pdf' })
            const uploadResult = await uploadFileToStorage(pdfFile, `reports/${unitId}`)
            const pdfUrl = uploadResult.url

            // Create report with PDF URL
            await createReport({
                unitId,
                month: monthName,
                year: yearVal,
                paymentIds: unreportedPayments.map(p => p.id),
                invoiceIds: Array.from(allInvoiceIds),
                pdfUrl
            })

            alert('Cierre mensual guardado con éxito')
            refetchHistory()
            setActiveTab('history')
        } catch (error) {
            console.error(error)
            alert('Error al cerrar el mes')
        } finally {
            setGenerating(false)
        }
    }

    const handleReopenReport = async (reportId: string) => {
        if (!confirm('¿Estás seguro de reabrir este cierre? Los documentos asociados volverán a estar disponibles para futuros cierres.')) return

        setGenerating(true)
        try {
            await deleteReport(reportId)
            refetchHistory()
            setSelectedReport(null)
            alert('Cierre reabierto con éxito')
        } catch (error) {
            console.error(error)
            alert('Error al reabrir el cierre')
        } finally {
            setGenerating(false)
        }
    }

    // Helper to calculate report totals
    const calcReportTotal = (report: MonthlyReport) => {
        if (!report.payments) return 0
        return report.payments.reduce((sum, p) => sum + Number(p.amountPaid || 0), 0)
    }

    // Export a specific report to multi-sheet Excel
    const exportReportToExcel = (report: MonthlyReport) => {
        const wb = XLSX.utils.book_new()

        // Sheet 1: Resumen
        const summaryData = [
            ['RESUMEN DE CIERRE MENSUAL'],
            [],
            ['Período', `${report.month} ${report.year}`],
            ['Unidad', selectedUnit?.name || 'N/A'],
            ['Fecha de Cierre', new Date(report.createdAt).toLocaleDateString()],
            [],
            ['Total Pagos', report._count?.payments || report.payments?.length || 0],
            ['Total Facturas', report._count?.invoices || report.invoices?.length || 0],
            [],
            ['TOTALES'],
            ['Total Bruto', calcReportTotal(report)]
        ]
        const summarySheet = XLSX.utils.aoa_to_sheet(summaryData)
        XLSX.utils.book_append_sheet(wb, summarySheet, 'Resumen')

        // Sheet 2: Pagos
        if (report.payments && report.payments.length > 0) {
            const paymentsData = report.payments.map(p => {
                // Get provider from invoiceItems
                const provider = (p as any).invoiceItems?.[0]?.invoice?.provider
                const invoiceNums = (p as any).invoiceItems?.map((item: any) => item.invoice?.invoiceNumber).filter(Boolean).join(', ') || '-'
                return {
                    'CE': p.consecutiveNumber ? `CE-${p.consecutiveNumber}` : 'EXTERNO',
                    'Fecha': new Date(p.paymentDate).toLocaleDateString(),
                    'Beneficiario': provider?.name || 'N/A',
                    'NIT': (p.provider as any)?.nit || '',
                    'Factura(s)': invoiceNums,
                    'Valor Bruto': Number(p.amountPaid),
                    'ReteFuente': Number(p.retefuenteApplied || 0),
                    'ReteICA': Number(p.reteicaApplied || 0),
                    'Valor Neto': Number(p.netValue || 0)
                }
            })
            const paymentsSheet = XLSX.utils.json_to_sheet(paymentsData)
            XLSX.utils.book_append_sheet(wb, paymentsSheet, 'Pagos')
        }

        // Sheet 3: Relación Facturas (Consolidated)
        if (report.invoices && report.invoices.length > 0) {
            // Deduplicate logic already applied in tempReport construction, but valid check here too
            const invoicesData = report.invoices.map(inv => {
                // Find payments for this invoice inside report.payments
                const relatedPayments = report.payments?.filter(p =>
                    (p as any).invoiceItems?.some((item: any) => item.invoice?.id === inv.id)
                ) || []

                // Calculate Amount Paid THIS period (via relatedPayments)
                const paidInThisReport = relatedPayments.reduce((sum, p) => {
                    const item = (p as any).invoiceItems?.find((i: any) => i.invoice?.id === inv.id)
                    return sum + Number(item?.amountApplied || 0)
                }, 0)

                const ceList = relatedPayments.map(p =>
                    p.consecutiveNumber ? `CE-${p.consecutiveNumber}` : 'EXTERNO'
                ).join(', ')

                return {
                    'Estado': inv.status === 'PAID' ? 'Pagada' : (inv.status === 'PARTIALLY_PAID' ? 'Parcial' : 'Pendiente'),
                    'Fecha Factura': new Date(inv.invoiceDate).toLocaleDateString(),
                    'Vencimiento': inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '-',
                    'Proveedor': (inv as any).provider?.name || 'N/A',
                    'NIT': (inv as any).provider?.nit || '-',
                    '# Factura': inv.invoiceNumber,
                    'Valor Total': Number(inv.totalAmount),
                    'Pagado (Este Periodo)': paidInThisReport,
                    'CE Asociados': ceList || '-',
                    'Saldo Pendiente': Number(inv.balance ?? ((inv.status === 'PAID') ? 0 : inv.totalAmount))
                }
            })

            // Sort by Date
            invoicesData.sort((a, b) => new Date(a['Fecha Factura']).getTime() - new Date(b['Fecha Factura']).getTime())

            const ws = XLSX.utils.json_to_sheet(invoicesData)

            // Adjust column widths
            ws['!cols'] = [
                { wch: 10 }, // Estado
                { wch: 12 }, // Fecha
                { wch: 12 }, // Vencimiento
                { wch: 30 }, // Proveedor
                { wch: 15 }, // NIT
                { wch: 15 }, // # Factura
                { wch: 15 }, // Valor Total
                { wch: 18 }, // Pagado este periodo
                { wch: 15 }, // CE Asociados
                { wch: 15 }  // Saldo
            ]

            XLSX.utils.book_append_sheet(wb, ws, 'Relación Facturas')
        }

        // Download
        const filename = `Cierre_${report.month}_${report.year}.xlsx`
        XLSX.writeFile(wb, filename)
    }


    const handlePilaUpload = async (paymentId: string, file: File) => {
        setUploadingPilaId(paymentId)
        try {
            const pilaUrl = await uploadFile(file, `payments/${unitId}`)
            await updatePayment(paymentId, { pilaFileUrl: pilaUrl })
            toast.success('PILA cargada con éxito')
            // Refresh payments list to show the new file
            queryClient.invalidateQueries({ queryKey: ['payments'] })
        } catch (error) {
            console.error('Error uploading PILA:', error)
            toast.error('Error al cargar PILA')
        } finally {
            setUploadingPilaId(null)
        }
    }

    const handleGenerateFolder = async () => {
        // Validation: Ensure all payments have required documents
        const missingDocs: string[] = []

        filteredPayments.forEach(p => {
            const ceRef = p.consecutiveNumber ? `CE-${p.consecutiveNumber}` : `Pago a ${p.provider?.name}`

            // 1. Check Payment Support (Bank Receipt)
            if (!p.supportFileUrl) {
                missingDocs.push(`${ceRef}: Falta Soporte de Pago (Nube)`)
            }

            // 2. Check Original Invoice (Factura)
            if ((p as any).invoiceItems && (p as any).invoiceItems.length > 0) {
                (p as any).invoiceItems.forEach((item: any) => {
                    if (!item.invoice.fileUrl) {
                        missingDocs.push(`${ceRef}: Falta Factura Original (${item.invoice.invoiceNumber})`)
                    }
                })
            }
        })

        if (missingDocs.length > 0) {
            setValidationErrors(missingDocs)
            setShowValidationModal(true)
            return
        }

        setGenerating(true)
        try {
            const pdfBytes = await generateAccountingFolder({
                unitName: selectedUnit?.name || "Unidad",
                unitNit: selectedUnit?.taxId || "N/A",
                unitAddress: selectedUnit?.address || "Sin dirección",
                month: new Date(dateFrom + 'T12:00:00').toLocaleString('es-CO', { month: 'long' }),
                year: new Date(dateFrom + 'T12:00:00').getFullYear().toString(),
                payments: filteredPayments as any, // Cast to match generator requirements
                pendingInvoices: pendingInvoices as any,
                unitInfo: {
                    name: selectedUnit?.name || "Unidad",
                    taxId: selectedUnit?.taxId || "N/A",
                    address: selectedUnit?.address || "Sin dirección",
                    logoUrl: selectedUnit?.logoUrl
                },
                includePila: true
            })

            // Download/Preview Blob
            const filename = `Carpeta_Contable_${dateFrom}_${dateTo}.pdf`
            const file = new File([pdfBytes as unknown as BlobPart], filename, { type: 'application/pdf' })
            const url = URL.createObjectURL(file)
            window.open(url, '_blank')
        } catch (error) {
            console.error('Error generating folder:', error)
            alert('Error al generar la carpeta contable')
        } finally {
            setGenerating(false)
        }
    }

    const { data: paymentsData, isLoading } = useQuery({
        queryKey: ['payments', unitId, dateFrom, dateTo],
        queryFn: () => getPayments({ unitId }),
        enabled: !!unitId
    })

    const { data: providersData } = useQuery({
        queryKey: ['providers'],
        queryFn: () => getProviders()
    })

    const [payments] = useState<Payment[]>(paymentsData?.payments || [])
    const providers: Provider[] = providersData?.providers || []

    const filteredPayments = payments.filter(p => {
        const paymentDate = new Date(p.paymentDate)
        const from = new Date(dateFrom + 'T00:00:00')
        const to = new Date(dateTo + 'T23:59:59')

        const inDateRange = paymentDate >= from && paymentDate <= to
        if (selectedProvider && (p.provider as any)?.id !== selectedProvider) return false
        return inDateRange
    })

    // Filter PENDING INVOICES (Accounts Payable)
    // 1. Issue Date in current month/range
    // 2. Balance > 0
    const { data: invoicesData } = useQuery({
        queryKey: ['invoices', unitId],
        queryFn: () => getInvoices({ unitId }),
        enabled: !!unitId
    })

    const allInvoices: (Invoice & { provider?: Provider })[] = invoicesData?.invoices || []

    const pendingInvoices = allInvoices.filter(inv => {
        const invoiceDate = new Date(inv.invoiceDate)
        const from = new Date(dateFrom + 'T00:00:00')
        const to = new Date(dateTo + 'T23:59:59')

        const inRange = invoiceDate >= from && invoiceDate <= to
        const isUnpaid = (inv.balance || 0) > 0

        const matchesProvider = !selectedProvider || inv.providerId === selectedProvider

        return inRange && isUnpaid && matchesProvider
    })


    // Calculate totals
    const totals = filteredPayments.reduce((acc, p) => ({
        gross: acc.gross + Number(p.amountPaid),
        retefuente: acc.retefuente + Number(p.retefuenteApplied),
        reteica: acc.reteica + Number(p.reteicaApplied),
        net: acc.net + Number(p.netValue)
    }), { gross: 0, retefuente: 0, reteica: 0, net: 0 })

    // Export to Excel
    const exportToExcel = () => {
        const data = filteredPayments.map(p => ({
            'CE': p.consecutiveNumber ? `CE-${p.consecutiveNumber}` : 'EXTERNO',
            'Fecha': formatDate(p.paymentDate),
            'Beneficiario': p.provider?.name || 'N/A',
            'NIT': (p.provider as any)?.nit || '',
            'Valor Bruto': Number(p.amountPaid),
            'ReteFuente': Number(p.retefuenteApplied),
            'ReteICA': Number(p.reteicaApplied),
            'Valor Neto': Number(p.netValue),
            'Estado': p.status === 'CONCILIATED' ? 'Conciliado' : 'Pendiente'
        }))

        // Add totals row
        data.push({
            'CE': '',
            'Fecha': 'TOTALES',
            'Beneficiario': '',
            'NIT': '',
            'Valor Bruto': totals.gross,
            'ReteFuente': totals.retefuente,
            'ReteICA': totals.reteica,
            'Valor Neto': totals.net,
            'Estado': ''
        })

        const ws = XLSX.utils.json_to_sheet(data)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Novedades')

        // Format columns
        ws['!cols'] = [
            { wch: 12 }, // CE
            { wch: 12 }, // Fecha
            { wch: 35 }, // Beneficiario
            { wch: 15 }, // NIT
            { wch: 15 }, // Valor Bruto
            { wch: 12 }, // ReteFuente
            { wch: 12 }, // ReteICA
            { wch: 15 }, // Valor Neto
            { wch: 12 }, // Estado
        ]

        const filename = `Novedades_${dateFrom}_a_${dateTo}.xlsx`
        XLSX.writeFile(wb, filename)
    }

    // Quick date filters
    const setQuickFilter = (filter: 'thisMonth' | 'lastMonth' | 'last3Months') => {
        switch (filter) {
            case 'thisMonth': {
                const range = getMonthRange(0)
                setDateFrom(range.start)
                setDateTo(range.end)
                break
            }
            case 'lastMonth': {
                const range = getMonthRange(1)
                setDateFrom(range.start)
                setDateTo(range.end)
                break
            }
            case 'last3Months': {
                const range = getMonthRange(2)
                const current = getMonthRange(0)
                setDateFrom(range.start)
                setDateTo(current.end)
                break
            }
        }
    }


    const handleDownloadAccountantPackage = async () => {
        // Validation: Ensure all payments have required documents
        const missingDocs: string[] = []

        filteredPayments.forEach(p => {
            const ceRef = p.consecutiveNumber ? `CE-${p.consecutiveNumber}` : `Pago a ${p.provider?.name}`
            if (!p.supportFileUrl) missingDocs.push(`${ceRef}: Falta Soporte de Pago (Nube)`)
            if ((p as any).invoiceItems && (p as any).invoiceItems.length > 0) {
                (p as any).invoiceItems.forEach((item: any) => {
                    if (!item.invoice.fileUrl) missingDocs.push(`${ceRef}: Falta Factura Original (${item.invoice.invoiceNumber})`)
                })
            }
        })

        if (missingDocs.length > 0) {
            setValidationErrors(missingDocs)
            setShowValidationModal(true)
            return
        }

        if (!confirm('¿Descargar Paquete para Contador?\nSe generará el reporte en Excel y un PDF con los soportes (sin comprobantes internos).')) return

        setGenerating(true)
        try {
            const reportDate = new Date(dateFrom + 'T12:00:00')
            const monthName = reportDate.toLocaleString('es-CO', { month: 'long' })
            const yearVal = reportDate.getFullYear().toString()

            // 1. Generate Excel (Construct fake report to reuse existing function)
            // Deduplicate invoices: pending + paid
            const allInvoicesMap = new Map();
            filteredPayments.forEach(p => {
                (p as any).invoiceItems?.forEach((item: any) => {
                    if (item.invoice) allInvoicesMap.set(item.invoice.id, item.invoice);
                });
            });
            pendingInvoices.forEach(inv => allInvoicesMap.set(inv.id, inv));
            const uniqueInvoices = Array.from(allInvoicesMap.values());

            const tempReport: MonthlyReport = {
                id: 'temp',
                unitId: selectedUnit?.id || '',
                month: monthName,
                year: yearVal,
                status: 'GENERATED',
                createdAt: new Date().toISOString(),
                payments: filteredPayments as any,
                invoices: uniqueInvoices as any,
                _count: {
                    payments: filteredPayments.length,
                    invoices: uniqueInvoices.length
                }
            }
            exportReportToExcel(tempReport)

            // 2. Generate PDF (Only Supports)
            const pdfBytes = await generateAccountingFolder({
                unitName: selectedUnit?.name || "Unidad",
                unitNit: selectedUnit?.taxId || "N/A",
                unitAddress: selectedUnit?.address || "Sin dirección",
                month: monthName,
                year: yearVal,
                payments: filteredPayments as any,
                pendingInvoices: pendingInvoices as any,
                unitInfo: {
                    name: selectedUnit?.name || "Unidad",
                    taxId: selectedUnit?.taxId || "N/A",
                    address: selectedUnit?.address || "Sin dirección",
                    logoUrl: selectedUnit?.logoUrl
                },
                skipInternalCE: true,
                includePila: true
            })

            const filename = `Soportes_${monthName}_${yearVal}.pdf`
            const blob = new Blob([pdfBytes as any], { type: 'application/pdf' })
            const link = document.createElement('a')
            link.href = URL.createObjectURL(blob)
            link.download = filename
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)

            alert('Paquete descargado con éxito (Excel + PDF Soportes)')
        } catch (error) {
            console.error('Error generating package:', error)
            alert('Error al generar paquete')
        } finally {
            setGenerating(false)
        }
    }

    const handlePreviewVoucher = async (payment: any) => {
        try {
            const invoices = (payment.invoiceItems || []).map((item: any) => ({
                invoiceNumber: item.invoice?.invoiceNumber || '',
                invoiceDate: item.invoice?.invoiceDate || '',
                description: item.invoice?.description,
                amount: Number(item.amountApplied)
            }))

            await openPaymentReceiptPreview({
                unitName: selectedUnit?.name || 'Unidad',
                unitNit: selectedUnit?.taxId || 'N/A',
                unitAddress: selectedUnit?.address,
                consecutiveNumber: payment.consecutiveNumber,
                paymentDate: payment.paymentDate,
                providerName: payment.provider?.name || 'N/A',
                providerNit: (payment.provider as any)?.nit || 'SIN_NIT',
                providerDv: payment.provider?.dv || '',
                invoices: invoices,
                grossAmount: Number(payment.amountPaid),
                retefuente: Number(payment.retefuenteApplied),
                reteica: Number(payment.reteicaApplied),
                netAmount: Number(payment.netValue),
                paymentMethod: payment.bankPaymentMethod,
                bankAccount: payment.provider?.bankAccount,
                transactionRef: payment.transactionRef,
                logoUrl: selectedUnit?.logoUrl
            })
        } catch (error) {
            console.error('Error opening voucher preview:', error)
            toast.error('Error al generar la vista previa del comprobante')
        }
    }

    return (
        <>
            <div className="space-y-6 animate-fade-in">
                {/* TABS */}
                <div className="flex gap-4 border-b border-gray-200">
                    <button
                        onClick={() => setActiveTab('generate')}
                        className={`pb-2 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'generate'
                            ? 'border-indigo-600 text-indigo-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        Generar Reporte
                    </button>
                    <button
                        onClick={() => setActiveTab('audit')}
                        className={`pb-2 px-4 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'audit'
                            ? 'border-indigo-600 text-indigo-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        <Brain className="w-4 h-4" />
                        Auditor Virtual (IA)
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`pb-2 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'history'
                            ? 'border-indigo-600 text-indigo-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        Historial de Cierres
                    </button>
                </div>

                {activeTab === 'audit' ? (
                    <div className="space-y-6">
                        <div className="bg-gradient-to-r from-indigo-50 to-violet-50 rounded-xl p-6 border border-indigo-100 relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-4 opacity-10">
                                <Brain className="w-32 h-32" />
                            </div>
                            <h2 className="text-lg font-bold text-indigo-900 mb-2 flex items-center gap-2">
                                <Brain className="w-6 h-6 text-indigo-600" />
                                Análisis de Cierre Inteligente
                            </h2>
                            <p className="text-sm text-indigo-700 max-w-2xl">
                                La IA ha analizado los movimientos de este mes para detectar anomalías, validar cumplimiento y sugerir puntos clave para el informe de gestión.
                            </p>
                        </div>

                        {isLoadingAudit ? (
                            <div className="flex flex-col items-center justify-center py-12">
                                <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mb-4" />
                                <p className="text-gray-500 font-medium">Auditando transacciones...</p>
                                <p className="text-gray-400 text-sm">Calculando variaciones y validando soportes</p>
                            </div>
                        ) : auditData ? (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* AI Summary Card */}
                                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                                    <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                                        <FileText className="w-5 h-5 text-gray-600" />
                                        Resumen Ejecutivo (Sugerido)
                                    </h3>
                                    <div className="bg-gray-50 rounded-lg p-4 text-gray-700 text-sm leading-relaxed border border-gray-100">
                                        {auditData.aiAnalysis?.summary || 'No hay datos suficientes para generar el resumen.'}
                                    </div>
                                    <div className="mt-4 flex gap-2">
                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText(auditData.aiAnalysis?.summary || '')
                                                toast.success('Texto copiado al portapapeles')
                                            }}
                                            className="text-xs text-indigo-600 font-medium hover:underline"
                                        >
                                            Copiar para informe
                                        </button>
                                    </div>
                                </div>

                                {/* Compliance & Anomalies */}
                                <div className="space-y-6">
                                    {/* Anomalies */}
                                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                                        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                                            <TrendingUp className="w-5 h-5 text-orange-500" />
                                            Anomalías de Gasto ({auditData.aiAnalysis?.anomalies?.length || 0})
                                        </h3>
                                        {auditData.aiAnalysis?.anomalies?.length > 0 ? (
                                            <ul className="space-y-3">
                                                {auditData.aiAnalysis.anomalies.map((anomaly: string, i: number) => (
                                                    <li key={i} className="flex gap-3 text-sm text-gray-600">
                                                        <AlertOctagon className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                                                        {anomaly}
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <div className="flex items-center gap-2 text-green-600 text-sm bg-green-50 p-3 rounded-lg">
                                                <CheckCircle className="w-4 h-4" />
                                                No se detectaron variaciones inusuales.
                                            </div>
                                        )}
                                    </div>

                                    {/* Compliance Issues */}
                                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                                        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                                            <AlertOctagon className="w-5 h-5 text-red-500" />
                                            Alertas de Cumplimiento
                                        </h3>
                                        {auditData.complianceIssues?.length > 0 ? (
                                            <div className="space-y-3">
                                                {auditData.complianceIssues.map((issue: any, i: number) => (
                                                    <div key={i} className="bg-red-50 border border-red-100 rounded-lg p-3">
                                                        <p className="text-sm font-semibold text-red-800 mb-1">
                                                            {issue.type === 'MISSING_INVOICE_SUPPORT' ? 'Facturas sin Soporte (PDF)' : 'Problema de Cumplimiento'}
                                                        </p>
                                                        <p className="text-xs text-red-600 mb-2">
                                                            Se encontraron {issue.count} registros incompletos.
                                                        </p>
                                                        <div className="max-h-24 overflow-y-auto pl-4 border-l-2 border-red-200">
                                                            <ul className="text-xs text-red-700 space-y-1">
                                                                {issue.details.map((d: string, idx: number) => (
                                                                    <li key={idx}>{d}</li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2 text-green-600 text-sm bg-green-50 p-3 rounded-lg">
                                                <CheckCircle className="w-4 h-4" />
                                                Todos los soportes documentales están en orden.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-12 text-gray-500">
                                No hay datos para auditar en este periodo.
                            </div>
                        )}
                    </div>
                ) : activeTab === 'history' ? (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-6 border-b border-gray-100">
                            <h2 className="text-lg font-semibold text-gray-800">Historial de Carpetas Mensuales</h2>
                        </div>
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-xs uppercase font-semibold text-gray-500">
                                <tr>
                                    <th className="px-6 py-3">Fecha Cierre</th>
                                    <th className="px-6 py-3">Periodo</th>
                                    <th className="px-6 py-3 text-center">Facturas</th>
                                    <th className="px-6 py-3 text-center">Pagos</th>
                                    <th className="px-6 py-3 text-right">Total Egresos</th>
                                    <th className="px-6 py-3 text-center">Estado</th>
                                    <th className="px-6 py-3 text-center">PDF</th>
                                    <th className="px-6 py-3 text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {(historyReports || []).map((report) => (
                                    <tr key={report.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4">{new Date(report.createdAt).toLocaleDateString()}</td>
                                        <td className="px-6 py-4 font-medium text-gray-900 capitalize">{report.month} {report.year}</td>
                                        <td className="px-6 py-4 text-center">{report._count?.invoices || 0}</td>
                                        <td className="px-6 py-4 text-center">{report._count?.payments || 0}</td>
                                        <td className="px-6 py-4 text-right font-medium text-gray-900">{formatMoney(calcReportTotal(report))}</td>
                                        <td className="px-6 py-4 text-center">
                                            <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">{report.status}</span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {report.pdfUrl ? (
                                                <button
                                                    onClick={() => window.open(report.pdfUrl!, '_blank')}
                                                    className="p-1 text-indigo-600 hover:bg-indigo-50 rounded"
                                                    title="Descargar PDF"
                                                >
                                                    <FileText className="w-4 h-4" />
                                                </button>
                                            ) : (
                                                <span className="text-gray-400 text-xs">---</span>
                                            )}
                                            <button
                                                onClick={() => exportReportToExcel(report)}
                                                className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                                                title="Exportar Excel"
                                            >
                                                <FileSpreadsheet className="w-4 h-4" />
                                            </button>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                    onClick={() => setSelectedReport(report)}
                                                    className="p-1 text-indigo-600 hover:bg-indigo-50 rounded"
                                                    title="Ver Detalle"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleReopenReport(report.id)}
                                                    className="p-1 text-red-600 hover:bg-red-50 rounded"
                                                    title="Reabrir Cierre"
                                                    disabled={generating}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {(!historyReports || historyReports.length === 0) && (
                                    <tr>
                                        <td colSpan={8} className="px-6 py-8 text-center text-gray-500">No hay cierres registrados aún.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900">Cierre Mensual</h1>
                                <p className="text-sm text-gray-500 mt-1">Resumen de egresos y generación de carpeta mensual</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={handleDownloadAccountantPackage}
                                    disabled={(filteredPayments.length === 0 && pendingInvoices.length === 0) || generating}
                                    className="px-4 py-2 bg-brand-100 text-brand-700 hover:bg-brand-200 rounded-button text-sm font-medium shadow-sm flex items-center gap-2 disabled:opacity-50"
                                    title="Descargar Excel + PDF de Soportes (para Contador)"
                                >
                                    <Briefcase className="w-4 h-4" />
                                    Paquete Contador
                                </button>
                                <button
                                    onClick={handleGenerateFolder}
                                    disabled={(filteredPayments.length === 0 && pendingInvoices.length === 0) || generating}
                                    className="px-4 py-2 bg-brand-primary text-white rounded-button text-sm font-medium hover:bg-brand-700 shadow-sm flex items-center gap-2 disabled:opacity-50"
                                >
                                    <FolderDown className="w-4 h-4" />
                                    {generating ? 'Generando...' : 'Carpeta Mensual'}
                                </button>
                                <button
                                    onClick={handleCloseMonth}
                                    disabled={generating || (filteredPayments.length === 0 && pendingInvoices.length === 0)}
                                    className="px-4 py-2 bg-brand-primary text-white rounded-button text-sm font-medium hover:bg-brand-700 shadow-lg shadow-brand-200 flex items-center gap-2 transition-all disabled:opacity-50"
                                >
                                    <FileText className="w-4 h-4" />
                                    Cerrar Mes
                                </button>
                                <button
                                    onClick={exportToExcel}
                                    disabled={filteredPayments.length === 0}
                                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 shadow-sm flex items-center gap-2 disabled:opacity-50 hidden"
                                >
                                    <Download className="w-4 h-4" />
                                    Exportar Excel
                                </button>
                            </div>
                        </div>

                        {/* Filters */}
                        <div className="card p-4">
                            <div className="flex flex-wrap items-end gap-4">
                                {/* Date Range */}
                                <div className="flex items-center gap-2">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Desde</label>
                                        <div className="relative">
                                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            <input
                                                type="date"
                                                value={dateFrom}
                                                onChange={(e) => setDateFrom(e.target.value)}
                                                className="pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                            />
                                        </div>
                                    </div>
                                    <span className="text-gray-400 pb-2">→</span>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Hasta</label>
                                        <div className="relative">
                                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            <input
                                                type="date"
                                                value={dateTo}
                                                onChange={(e) => setDateTo(e.target.value)}
                                                className="pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Quick filters */}
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => setQuickFilter('thisMonth')}
                                        className="px-3 py-2 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg"
                                    >
                                        Este mes
                                    </button>
                                    <button
                                        onClick={() => setQuickFilter('lastMonth')}
                                        className="px-3 py-2 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg"
                                    >
                                        Mes anterior
                                    </button>
                                    <button
                                        onClick={() => setQuickFilter('last3Months')}
                                        className="px-3 py-2 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg"
                                    >
                                        Últimos 3 meses
                                    </button>
                                </div>

                                {/* Provider filter */}
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Proveedor</label>
                                    <div className="relative">
                                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        <select
                                            value={selectedProvider}
                                            onChange={(e) => setSelectedProvider(e.target.value)}
                                            className="pl-10 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 appearance-none bg-white"
                                        >
                                            <option value="">Todos los proveedores</option>
                                            {providers.map(p => (
                                                <option key={p.id} value={p.id}>{p.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Summary Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="card p-4 border-l-4 border-l-gray-400">
                                <p className="text-sm text-gray-500">Total Bruto</p>
                                <p className="text-xl font-bold text-gray-900 mt-1">{formatMoney(totals.gross)}</p>
                                <p className="text-xs text-gray-500 mt-1">{filteredPayments.length} egresos</p>
                            </div>
                            <div className="card p-4 border-l-4 border-l-red-400">
                                <p className="text-sm text-gray-500">Retención Fuente</p>
                                <p className="text-xl font-bold text-red-600 mt-1">-{formatMoney(totals.retefuente)}</p>
                            </div>
                            <div className="card p-4 border-l-4 border-l-orange-400">
                                <p className="text-sm text-gray-500">Retención ICA</p>
                                <p className="text-xl font-bold text-orange-600 mt-1">-{formatMoney(totals.reteica)}</p>
                            </div>
                            <div className="card p-4 border-l-4 border-l-emerald-500">
                                <p className="text-sm text-gray-500">Total Neto Pagado</p>
                                <p className="text-xl font-bold text-emerald-600 mt-1">{formatMoney(totals.net)}</p>
                            </div>
                        </div>

                        {/* Data Table */}
                        <div className="card overflow-hidden">
                            <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                                <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                                    <FileSpreadsheet className="w-4 h-4" />
                                    Detalle de Novedades
                                </h3>
                                <span className="text-sm text-gray-500">{filteredPayments.length} registros</span>
                            </div>

                            {isLoading ? (
                                <div className="p-8 text-center text-gray-500">Cargando...</div>
                            ) : filteredPayments.length === 0 ? (
                                <div className="p-8 text-center text-gray-500">
                                    No hay egresos en el período seleccionado
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead className="bg-gray-50 text-xs uppercase text-gray-500 tracking-wider">
                                            <tr>
                                                <th className="px-4 py-3 text-left font-semibold">CE</th>
                                                <th className="px-4 py-3 text-left font-semibold">Fecha</th>
                                                <th className="px-4 py-3 text-left font-semibold">Beneficiario</th>
                                                <th className="px-4 py-3 text-left font-semibold">NIT</th>
                                                <th className="px-4 py-3 text-right font-semibold">Valor Bruto</th>
                                                <th className="px-4 py-3 text-right font-semibold">ReteFte</th>
                                                <th className="px-4 py-3 text-right font-semibold">ReteICA</th>
                                                <th className="px-4 py-3 text-right font-semibold">Valor Neto</th>
                                                <th className="px-4 py-3 text-center font-semibold">Conciliación</th>
                                                <th className="px-4 py-3 text-center font-semibold">PILA</th>
                                                <th className="px-4 py-3 text-center font-semibold">Soporte</th>
                                                <th className="px-4 py-3 text-center font-semibold">Factura</th>
                                                <th className="px-4 py-3 text-center font-semibold">Docs</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {filteredPayments.map(payment => (
                                                <tr key={payment.id} className="hover:bg-gray-50">
                                                    <td className="px-4 py-3">
                                                        {payment.consecutiveNumber ? (
                                                            <button
                                                                onClick={() => handlePreviewVoucher(payment)}
                                                                className="font-mono text-sm bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded hover:bg-indigo-100 hover:underline cursor-pointer transition-colors"
                                                                title="Ver Comprobante de Egreso"
                                                            >
                                                                CE-{payment.consecutiveNumber}
                                                            </button>
                                                        ) : (
                                                            <span className="text-xs text-gray-400">EXTERNO</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-sm text-gray-600">{formatDate(payment.paymentDate)}</td>
                                                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{payment.provider?.name || 'N/A'}</td>
                                                    <td className="px-4 py-3 text-sm text-gray-500 font-mono">{(payment.provider as any)?.nit || '-'}</td>
                                                    <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">{formatMoney(Number(payment.amountPaid))}</td>
                                                    <td className="px-4 py-3 text-sm text-right text-red-600">
                                                        {Number(payment.retefuenteApplied) > 0 ? `-${formatMoney(Number(payment.retefuenteApplied))}` : '-'}
                                                    </td>
                                                    <td className="px-4 py-3 text-sm text-right text-orange-600">
                                                        {Number(payment.reteicaApplied) > 0 ? `-${formatMoney(Number(payment.reteicaApplied))}` : '-'}
                                                    </td>
                                                    <td className="px-4 py-3 text-sm text-right font-semibold text-emerald-600">{formatMoney(Number(payment.netValue))}</td>
                                                    <td className="px-4 py-3 text-center">
                                                        {payment.status === 'CONCILIATED' ? (
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                                                                ✓ Conciliado
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                                                                Pendiente
                                                            </span>
                                                        )}
                                                        {payment.monthlyReportId && (
                                                            <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-600" title="Incluido en Cierre Contable">
                                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <div className="flex items-center justify-center gap-1">
                                                            {(payment as any).pilaFileUrl && (
                                                                <button
                                                                    onClick={() => openFileUrl((payment as any).pilaFileUrl!)}
                                                                    className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                                                                    title="Ver PILA"
                                                                >
                                                                    <Briefcase className="w-4 h-4" />
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => {
                                                                    const input = document.createElement('input')
                                                                    input.type = 'file'
                                                                    input.accept = '.pdf'
                                                                    input.onchange = (e) => {
                                                                        const file = (e.target as HTMLInputElement).files?.[0]
                                                                        if (file) handlePilaUpload(payment.id, file)
                                                                    }
                                                                    input.click()
                                                                }}
                                                                disabled={uploadingPilaId === payment.id}
                                                                className={`p-1 rounded ${(payment as any).pilaFileUrl ? 'text-gray-400 hover:bg-gray-100' : 'text-indigo-600 hover:bg-indigo-50'}`}
                                                                title="Cargar PILA"
                                                            >
                                                                {uploadingPilaId === payment.id ? (
                                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                                ) : (
                                                                    <Upload className="w-4 h-4" />
                                                                )}
                                                            </button>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        {payment.supportFileUrl ? (
                                                            <button
                                                                onClick={() => openFileUrl(payment.supportFileUrl!)}
                                                                className="inline-flex items-center justify-center p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                                                                title="Ver Soporte de Pago"
                                                            >
                                                                <FileText className="w-4 h-4" />
                                                            </button>
                                                        ) : (
                                                            <span className="text-gray-300">-</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        {/* Check invoiceItems for files */}
                                                        {(payment as any).invoiceItems && (payment as any).invoiceItems.length > 0 ? (
                                                            <div className="flex items-center justify-center gap-1">
                                                                {(payment as any).invoiceItems.map((item: any, idx: number) => (
                                                                    item.invoice?.fileUrl ? (
                                                                        <button
                                                                            key={idx}
                                                                            onClick={() => openFileUrl(item.invoice.fileUrl)}
                                                                            className="inline-flex items-center justify-center p-1 text-indigo-600 hover:bg-indigo-50 rounded"
                                                                            title={`Ver Factura ${item.invoice.invoiceNumber}`}
                                                                        >
                                                                            <FileSpreadsheet className="w-4 h-4" />
                                                                        </button>
                                                                    ) : null
                                                                ))}
                                                                {(payment as any).invoiceItems.every((item: any) => !item.invoice?.fileUrl) && (
                                                                    <span className="text-gray-300">-</span>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <span className="text-gray-300">-</span>
                                                        )}
                                                    </td>
                                                    {/* Document Completeness Indicators */}
                                                    <td className="px-4 py-3 text-center">
                                                        <div className="flex items-center justify-center gap-1" title="Factura | Soporte | CE">
                                                            {/* Invoice indicator */}
                                                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${(payment as any).invoiceItems?.some((item: any) => item.invoice?.fileUrl) ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-500'}`}>
                                                                {(payment as any).invoiceItems?.some((item: any) => item.invoice?.fileUrl) ? '✓' : '!'}
                                                            </span>
                                                            {/* Support indicator */}
                                                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${payment.supportFileUrl ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-500'}`}>
                                                                {payment.supportFileUrl ? '✓' : '!'}
                                                            </span>
                                                            {/* CE indicator */}
                                                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${payment.consecutiveNumber ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                                                                {payment.consecutiveNumber ? '✓' : 'E'}
                                                            </span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        {/* Totals row */}
                                        <tfoot className="bg-gray-100 font-semibold">
                                            <tr>
                                                <td className="px-4 py-3" colSpan={4}>TOTALES</td>
                                                <td className="px-4 py-3 text-right text-gray-900">{formatMoney(totals.gross)}</td>
                                                <td className="px-4 py-3 text-right text-red-600">-{formatMoney(totals.retefuente)}</td>
                                                <td className="px-4 py-3 text-right text-orange-600">-{formatMoney(totals.reteica)}</td>
                                                <td className="px-4 py-3 text-right text-emerald-600">{formatMoney(totals.net)}</td>
                                                <td className="px-4 py-3" colSpan={4}></td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* PENDING INVOICES TABLE */}
                        {pendingInvoices.length > 0 && (
                            <div className="mt-8">
                                <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                                    <FileText className="w-5 h-5 text-indigo-600" />
                                    Facturas Pendientes de Pago (Se incluirán en la carpeta)
                                </h3>
                                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                                    <table className="w-full text-sm text-left">
                                        <thead className="text-xs text-gray-500 uppercase bg-gray-50/50">
                                            <tr>
                                                <th className="px-4 py-3 font-medium">Fecha</th>
                                                <th className="px-4 py-3 font-medium">Proveedor</th>
                                                <th className="px-4 py-3 font-medium">Factura #</th>
                                                <th className="px-4 py-3 font-medium text-right">Valor Total</th>
                                                <th className="px-4 py-3 font-medium text-right">Saldo Pendiente</th>
                                                <th className="px-4 py-3 font-medium text-center">Soporte</th>
                                                <th className="px-4 py-3 font-medium text-center">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {pendingInvoices.map((inv) => (
                                                <tr key={inv.id} className="hover:bg-gray-50/50 transition-colors">
                                                    <td className="px-4 py-3">{formatDate(inv.invoiceDate)}</td>
                                                    <td className="px-4 py-3 font-medium text-gray-900">{inv.provider?.name || '---'}</td>
                                                    <td className="px-4 py-3 text-gray-600">{inv.invoiceNumber}</td>
                                                    <td className="px-4 py-3 text-right font-medium">{formatMoney(inv.totalAmount)}</td>
                                                    <td className="px-4 py-3 text-right font-bold text-red-600">
                                                        {formatMoney(inv.balance || inv.totalAmount)}
                                                        {inv.monthlyReportId && (
                                                            <span title="Incluido en Cierre Contable">
                                                                <CheckCircle2 className="inline w-4 h-4 text-blue-600 ml-1" />
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        {inv.fileUrl ? (
                                                            <button
                                                                onClick={() => openFileUrl(inv.fileUrl!)}
                                                                className="text-indigo-600 hover:text-indigo-800 p-1 hover:bg-indigo-50 rounded"
                                                                title="Ver Factura"
                                                            >
                                                                <FileSpreadsheet className="w-4 h-4" />
                                                            </button>
                                                        ) : (
                                                            <span className="text-gray-400">-</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <div className="flex items-center justify-center gap-1">
                                                            <button
                                                                onClick={() => {
                                                                    // Navigate to invoices page with this invoice selected for editing
                                                                    window.location.href = `/invoices?edit=${inv.id}`
                                                                }}
                                                                className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                                title="Editar Factura"
                                                            >
                                                                <Edit3 className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    // Navigate to payments page with this invoice pre-selected
                                                                    window.location.href = `/payments?invoiceId=${inv.id}`
                                                                }}
                                                                className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                                                title="Registrar Pago"
                                                            >
                                                                <CreditCard className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                    </div>
                )}



            </div>

            {
                showValidationModal && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
                        <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
                            <div className="sticky top-0 bg-white p-6 border-b border-gray-100 flex items-center gap-3 text-red-600 z-10">
                                <div className="bg-red-50 p-2 rounded-full">
                                    <AlertTriangle className="w-6 h-6" />
                                </div>
                                <h3 className="text-xl font-bold">Garantía Documental Incompleta</h3>
                            </div>

                            <div className="p-6 overflow-y-auto space-y-4">
                                <p className="text-gray-600">
                                    No se puede generar la carpeta mensual. El sistema ha detectado que faltan documentos obligatorios para los siguientes egresos:
                                </p>

                                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                                    <ul className="space-y-3">
                                        {validationErrors.map((error, index) => (
                                            <li key={index} className="flex items-start gap-3 text-sm text-gray-700">
                                                <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
                                                {error}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>

                            <div className="sticky bottom-0 bg-gray-50 p-6 border-t border-gray-100 flex justify-end z-10">
                                <button
                                    onClick={() => setShowValidationModal(false)}
                                    className="px-6 py-2 bg-brand-primary text-white rounded-button text-sm font-bold hover:bg-brand-700 transition-all shadow-lg shadow-brand-200"
                                >
                                    Entendido, voy a cargarlos
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Report Details Modal */}
            {selectedReport && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="sticky top-0 bg-white p-6 border-b border-gray-100 flex items-center justify-between z-10">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900 capitalize">
                                    Cierre: {selectedReport.month} {selectedReport.year}
                                </h2>
                                <p className="text-sm text-gray-500">
                                    Cerrado el {new Date(selectedReport.createdAt).toLocaleDateString()}
                                </p>
                            </div>
                            <button
                                onClick={() => setSelectedReport(null)}
                                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1 space-y-8">
                            {/* Payments Section */}
                            <div>
                                <h3 className="text-xs font-bold text-brand-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-brand-500" />
                                    Pagos Incluidos ({selectedReport.payments?.length || 0})
                                </h3>
                                {selectedReport.payments && selectedReport.payments.length > 0 ? (
                                    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                                        <table className="w-full text-sm">
                                            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                                                <tr>
                                                    <th className="px-4 py-3 text-left font-semibold">CE</th>
                                                    <th className="px-4 py-3 text-left font-semibold">Fecha</th>
                                                    <th className="px-4 py-3 text-left font-semibold">Proveedor</th>
                                                    <th className="px-4 py-3 text-right font-semibold">Monto</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {selectedReport.payments.map((p) => (
                                                    <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                                                        <td className="px-4 py-3">
                                                            <span className="font-mono text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">
                                                                {p.consecutiveNumber ? `CE-${p.consecutiveNumber}` : 'EXT'}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-gray-600">{formatDate(p.paymentDate)}</td>
                                                        <td className="px-4 py-3 font-medium text-gray-900">
                                                            {p.invoiceItems?.[0]?.invoice?.provider?.name || 'N/A'}
                                                        </td>
                                                        <td className="px-4 py-3 text-right font-bold text-gray-900">
                                                            {formatMoney(Number(p.amountPaid))}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <p className="text-gray-500 text-sm">No hay pagos en este cierre.</p>
                                )}
                            </div>

                            {/* Invoices Section */}
                            <div>
                                <h3 className="text-xs font-bold text-brand-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-brand-500" />
                                    Facturas Incluidas ({selectedReport.invoices?.length || 0})
                                </h3>
                                {selectedReport.invoices && selectedReport.invoices.length > 0 ? (
                                    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                                        <table className="w-full text-sm">
                                            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                                                <tr>
                                                    <th className="px-4 py-3 text-left font-semibold">Factura #</th>
                                                    <th className="px-4 py-3 text-left font-semibold">Proveedor</th>
                                                    <th className="px-4 py-3 text-right font-semibold">Monto</th>
                                                    <th className="px-4 py-3 text-center font-semibold">Soporte</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {selectedReport.invoices.map((inv) => (
                                                    <tr key={inv.id} className="hover:bg-gray-50/50 transition-colors">
                                                        <td className="px-4 py-3 font-medium text-indigo-600">{inv.invoiceNumber}</td>
                                                        <td className="px-4 py-3 text-gray-900">{inv.provider?.name || 'N/A'}</td>
                                                        <td className="px-4 py-3 text-right font-bold text-gray-900">
                                                            {formatMoney(Number(inv.totalAmount))}
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            {inv.fileUrl ? (
                                                                <button
                                                                    onClick={() => openFileUrl(inv.fileUrl!)}
                                                                    className="text-indigo-600 hover:text-indigo-800 p-1 hover:bg-indigo-50 rounded"
                                                                    title="Ver Factura"
                                                                >
                                                                    <FileSpreadsheet className="w-4 h-4" />
                                                                </button>
                                                            ) : (
                                                                <span className="text-gray-400">-</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <p className="text-gray-500 text-sm">No hay facturas pendientes en este cierre.</p>
                                )}
                            </div>
                        </div>

                        <div className="sticky bottom-0 bg-gray-50 p-6 border-t border-gray-100 flex justify-end gap-3 z-10">
                            <button
                                onClick={() => handleReopenReport(selectedReport.id)}
                                disabled={generating}
                                className="px-4 py-2 text-red-600 font-bold text-sm hover:bg-red-50 rounded-button transition-all disabled:opacity-50"
                            >
                                Reabrir Cierre
                            </button>
                            <button
                                onClick={() => setSelectedReport(null)}
                                className="px-6 py-2 bg-brand-primary text-white rounded-button text-sm font-bold hover:bg-brand-700 transition-all shadow-lg shadow-brand-200"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Print-only styles */}
            <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .card, .card * {
            visibility: visible;
          }
          .card {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          button, select, input {
            display: none !important;
          }
        }
      `}</style>
        </>
    )
}


