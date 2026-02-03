import { Plus, Search, Upload as UploadIcon, X, Calculator, Download, Loader2, FileText, CheckCircle2, AlertTriangle, Clock, Edit, Trash2, Mail, Sparkles, Check, MessageSquare } from 'lucide-react'
import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getPayments, getInvoices, createPayment, getProviders, updatePayment, linkInvoiceToPayment, deletePayment, connectGmail, getGmailStatus, analyzeDocument } from '../lib/api/index'
import type { Payment, Invoice, Provider } from '../lib/api/index'
import { uploadFileToStorage } from '../lib/storage'
import { exportToExcel } from '../lib/exportExcel'
import { useUnit } from '../lib/UnitContext'
import { formatMoney } from '../lib/format'
import { FeedbackModal, SmartFileUploader } from '../components/ui'


const statusStyles: Record<string, string> = {
    DRAFT: 'status-pending',
    PAID_NO_SUPPORT: 'status-error',
    COMPLETED: 'status-paid',
    CONCILIATED: 'status-conciliated',
}

const statusLabels: Record<string, string> = {
    DRAFT: 'Borrador',
    PAID_NO_SUPPORT: 'Sin Soporte',
    COMPLETED: 'Completo',
    CONCILIATED: 'Conciliado',
}

export default function PaymentsPage() {
    const { selectedUnit } = useUnit()
    const unitId = selectedUnit?.id || ''
    const [searchParams] = useSearchParams()



    const [search, setSearch] = useState(searchParams.get('search') || '')
    const [showModal, setShowModal] = useState(false)
    const [uploadPaymentId, setUploadPaymentId] = useState<string | null>(null)
    const [linkInvoicePayment, setLinkInvoicePayment] = useState<Payment | null>(null)
    const [editPayment, setEditPayment] = useState<any | null>(null)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<Payment | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [showFeedbackModal, setShowFeedbackModal] = useState(false)
    const [feedbackItem, setFeedbackItem] = useState<{ id: string, type: 'INVOICE' | 'PAYMENT' } | null>(null)
    const queryClient = useQueryClient()

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !uploadPaymentId) return

        try {
            // Upload to Storage
            const { url } = await uploadFileToStorage(file, `units / ${unitId} /payments/${uploadPaymentId} `)

            // Update Payment in DB
            await updatePayment(uploadPaymentId, { supportFileUrl: url })
            queryClient.invalidateQueries({ queryKey: ['payments'] })
            setUploadPaymentId(null)
            alert('Soporte subido correctamente')
        } catch (error) {
            console.error('Error uploading file:', error)
            alert('Error al subir el archivo')
        } finally {
            e.target.value = '' // Reset input
        }
    }

    const confirmDelete = async () => {
        if (!showDeleteConfirm) return
        setDeletingId(showDeleteConfirm.id)
        try {
            await deletePayment(showDeleteConfirm.id)
            queryClient.invalidateQueries({ queryKey: ['payments'] })
            queryClient.invalidateQueries({ queryKey: ['invoices'] })
            setShowDeleteConfirm(null)
        } catch (error) {
            console.error('Error deleting payment:', error)
            alert(error instanceof Error ? error.message : 'Error al eliminar el pago. Por favor intente de nuevo.')
        } finally {
            setDeletingId(null)
        }
    }

    const { data: paymentsData, isLoading } = useQuery({
        queryKey: ['payments', unitId],
        queryFn: () => getPayments({ unitId }),
        enabled: !!unitId
    })

    const { data: gmailStatus } = useQuery({
        queryKey: ['gmail-status', unitId],
        queryFn: () => unitId ? getGmailStatus(unitId) : Promise.resolve(null),
        enabled: !!unitId,
        refetchInterval: 5000
    })

    const payments = paymentsData?.payments || []

    const filtered = useMemo(() => {
        const lowerSearch = search.toLowerCase()
        return payments.filter((p: Payment & { provider?: { name: string } }) =>
            p.provider?.name?.toLowerCase().includes(lowerSearch) ||
            (p.consecutiveNumber && p.consecutiveNumber.toString().includes(search)) ||
            statusLabels[p.status]?.toLowerCase().includes(lowerSearch)
        )
    }, [payments, search])

    // Calculate stats
    const internalCount = payments.filter((p: Payment) => p.sourceType === 'INTERNAL').length
    const pendingSupportCount = payments.filter((p: Payment) => p.status === 'PAID_NO_SUPPORT').length
    const draftsCount = payments.filter((p: Payment) => p.status === 'DRAFT').length

    const handleApprovePayment = async (payment: Payment) => {
        try {
            // Check if payment has support file to decide status
            const newStatus = payment.supportFileUrl ? 'COMPLETED' : 'PAID_NO_SUPPORT'
            await updatePayment(payment.id, { status: newStatus })
            queryClient.invalidateQueries({ queryKey: ['payments'] })
        } catch (error) {
            console.error('Error approving payment:', error)
            alert('Error al aprobar el egreso.')
        }
    }

    return (
        <>
            <div className="space-y-6 animate-fade-in">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Egresos</h1>
                        <p className="text-sm text-gray-500 mt-1">Control de pagos y comprobantes</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {gmailStatus?.connected ? (
                            <div className="flex items-center gap-2 px-3 py-2 bg-green-50 text-green-700 rounded-lg text-sm border border-green-200">
                                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                <span className="font-medium">{gmailStatus.email}</span>
                            </div>
                        ) : (
                            <button
                                onClick={() => connectGmail(unitId)}
                                className="px-3 py-2 border border-blue-200 text-blue-700 bg-blue-50 rounded-lg text-sm font-medium hover:bg-blue-100 flex items-center gap-2"
                            >
                                <Mail className="w-4 h-4" />
                                Conectar Gmail
                            </button>
                        )}

                        <Link
                            to="/"
                            className="px-3 py-2 border border-indigo-200 text-indigo-700 bg-indigo-50 rounded-lg text-sm font-medium hover:bg-indigo-100 flex items-center gap-2"
                            title="Escanea egresos desde el panel principal"
                        >
                            <Sparkles className="w-4 h-4" />
                            Escanear Inbox →
                        </Link>


                        <button
                            onClick={() => {
                                const dataToExport = filtered.map((p: any) => ({
                                    consecutiveNumber: p.consecutiveNumber ? `CE - ${String(p.consecutiveNumber).padStart(4, '0')} ` : 'Sin CE',
                                    paymentDate: p.paymentDate,
                                    invoices: p.invoiceItems?.length || 0,
                                    amountPaid: Number(p.amountPaid),
                                    retefuente: Number(p.retefuenteApplied),
                                    reteica: Number(p.reteicaApplied),
                                    netValue: Number(p.netValue),
                                    status: statusLabels[p.status] || p.status
                                }))
                                exportToExcel(dataToExport, [
                                    { key: 'consecutiveNumber', header: 'CE #' },
                                    { key: 'paymentDate', header: 'Fecha', format: 'date' },
                                    { key: 'invoices', header: 'Facturas' },
                                    { key: 'amountPaid', header: 'Valor Bruto', format: 'money' },
                                    { key: 'retefuente', header: 'ReteFte', format: 'money' },
                                    { key: 'reteica', header: 'ReteICA', format: 'money' },
                                    { key: 'netValue', header: 'Valor Neto', format: 'money' },
                                    { key: 'status', header: 'Estado' }
                                ], `egresos_${new Date().toISOString().split('T')[0]} `)
                            }}
                            className="px-4 py-2 border border-gray-200 bg-white text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 shadow-sm flex items-center gap-2"
                        >
                            <Download className="w-4 h-4" />
                            Exportar
                        </button>
                        <button
                            onClick={() => setShowModal(true)}
                            className="px-4 py-2 bg-brand-primary text-white rounded-button text-sm font-medium hover:bg-brand-700 shadow-sm flex items-center gap-2"
                        >
                            <Plus className="w-4 h-4" />
                            Nuevo Egreso
                        </button>
                    </div>
                </div>

                {/* DRAFT ATTENTION ALERT */}
                {draftsCount > 0 && (
                    <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex items-center justify-between shadow-sm animate-pulse">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-100 rounded-lg text-purple-700">
                                <Sparkles className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-purple-900">Egresos en Borrador</p>
                                <p className="text-xs text-purple-700">Tienes {draftsCount} egresos importados que requieren revisión.</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setSearch('Borrador')}
                            className="px-3 py-1.5 bg-purple-600 text-white text-xs font-medium rounded-lg hover:bg-purple-700 transition-colors"
                        >
                            Revisar ahora
                        </button>
                    </div>
                )}

                {/* Mode Info */}
                <div className="card p-4 bg-gradient-to-r from-indigo-50 to-blue-50 border-indigo-100">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-medium text-indigo-900">Modo: <span className="font-bold">Mixto</span></p>
                            <p className="text-sm text-indigo-700 mt-0.5">Mes actual: <span className="font-bold">Diciembre 2024</span></p>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 bg-indigo-500 rounded-full"></span>
                                <span className="text-indigo-700">Internos: {internalCount}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                                <span className="text-amber-700">Pendientes Soporte: {pendingSupportCount}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Filters */}
                <div className="card p-4">
                    <div className="flex items-center gap-4">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar por proveedor o consecutivo..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                            />
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="card overflow-hidden">
                    {isLoading ? (
                        <div className="p-8 text-center text-gray-500">Cargando egresos...</div>
                    ) : payments.length === 0 ? (
                        <div className="p-8 text-center">
                            <p className="text-gray-500">No hay egresos registrados</p>
                            <button
                                onClick={() => setShowModal(true)}
                                className="mt-4 text-indigo-600 hover:text-indigo-700 font-medium text-sm"
                            >
                                + Registrar primer egreso
                            </button>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead className="bg-gray-50 border-b border-gray-100">
                                <tr>
                                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3"># CE</th>
                                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Beneficiario</th>
                                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Fecha</th>
                                    <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Bruto</th>
                                    <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Rete Fte</th>
                                    <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Rete ICA</th>
                                    <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Neto</th>
                                    <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Estado</th>
                                    <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Soporte</th>
                                    <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filtered.map((payment: Payment & { provider?: { name: string } }) => (
                                    <tr key={payment.id} className="hover:bg-gray-50/50">
                                        <td className="px-4 py-3">
                                            {payment.consecutiveNumber ? (
                                                <span className="font-mono text-sm font-medium text-gray-900">{payment.consecutiveNumber}</span>
                                            ) : (
                                                <span className="text-xs text-amber-600 font-medium">Pendiente</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div>
                                                <p className="font-medium text-gray-900">{payment.provider?.name || 'N/A'}</p>
                                                <p className="text-xs text-gray-500">{payment.sourceType === 'INTERNAL' ? '📄 Interno' : '📤 Externo'}</p>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-600">{new Date(payment.paymentDate).toLocaleDateString('es-CO')}</td>
                                        <td className="px-4 py-3 text-right font-medium text-gray-900">{formatMoney(Number(payment.amountPaid))}</td>
                                        <td className="px-4 py-3 text-right text-sm text-red-600">
                                            {Number(payment.retefuenteApplied) > 0 ? `- ${formatMoney(Number(payment.retefuenteApplied))} ` : '-'}
                                        </td>
                                        <td className="px-4 py-3 text-right text-sm text-red-600">
                                            {Number(payment.reteicaApplied) > 0 ? `- ${formatMoney(Number(payment.reteicaApplied))} ` : '-'}
                                        </td>
                                        <td className="px-4 py-3 text-right font-semibold text-emerald-600">{formatMoney(Number(payment.netValue))}</td>
                                        <td className="px-4 py-3 text-center">
                                            <div className="flex items-center justify-center gap-1">
                                                <span className={`status-pill ${payment.hasPendingInvoice ? 'bg-orange-100 text-orange-800 border border-orange-200' : (statusStyles[payment.status] || 'status-pending')}`}>
                                                    {payment.hasPendingInvoice ? 'Falta Factura' : (statusLabels[payment.status] || payment.status)}
                                                </span>
                                                {payment.monthlyReportId && (
                                                    <span title="Incluido en Cierre Contable">
                                                        <CheckCircle2 className="w-4 h-4 text-blue-600" />
                                                    </span>
                                                )}
                                                {payment.hasAuditIssue && (
                                                    <span title="Fecha de pago anterior a la factura">
                                                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                                                    </span>
                                                )}
                                                {payment.hasPendingInvoice && (
                                                    <span title="Pendiente de asociar factura">
                                                        <Clock className="w-4 h-4 text-orange-500" />
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <div className="flex items-center justify-center gap-1">
                                                {payment.supportFileUrl && (
                                                    <button
                                                        onClick={async (e) => {
                                                            e.stopPropagation()
                                                            try {
                                                                const url = payment.supportFileUrl!

                                                                // Handle Base64
                                                                if (url.startsWith('data:')) {
                                                                    const parts = url.split(',')
                                                                    if (parts.length < 2) throw new Error('Invalid data URI')
                                                                    const byteString = atob(parts[1])
                                                                    const mimeType = parts[0].split(':')[1]?.split(';')[0] || 'application/pdf'
                                                                    const ab = new ArrayBuffer(byteString.length)
                                                                    const ia = new Uint8Array(ab)
                                                                    for (let i = 0; i < byteString.length; i++) {
                                                                        ia[i] = byteString.charCodeAt(i)
                                                                    }
                                                                    const blob = new Blob([ab], { type: mimeType })
                                                                    window.open(URL.createObjectURL(blob), '_blank')
                                                                    return;
                                                                }

                                                                // Handle Cloudinary RAW files or _secure bypass files
                                                                // We fetch them and enforce application/pdf type so browser renders them
                                                                const isImage = /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(url) || url.includes('/image/upload/');

                                                                if (!isImage && (url.includes('/raw/upload/') || url.endsWith('.pdf_secure') || url.toLowerCase().endsWith('.pdf'))) {

                                                                    // Open window first to avoid popup blocker
                                                                    const newWindow = window.open('', '_blank');
                                                                    if (newWindow) {
                                                                        newWindow.document.write(`
                                                                            <html>
                                                                                <head><title>Cargando PDF...</title></head>
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
                                                                        } catch (fetchError) {
                                                                            newWindow.close();
                                                                            console.error('Fetch error:', fetchError);
                                                                            alert('No se pudo cargar la vista previa. Descargando archivo...');
                                                                            window.open(url, '_blank');
                                                                        }
                                                                    } else {
                                                                        // Fallback if popup blocked
                                                                        window.open(url, '_blank');
                                                                    }
                                                                } else {
                                                                    // Standard behavior for normal files and images
                                                                    window.open(url, '_blank')
                                                                }
                                                            } catch (err) {
                                                                console.error('Error opening file:', err)
                                                                alert('Archivo corrupto. Usa el botón de carga para subir uno nuevo.')
                                                            }
                                                        }}
                                                        className="inline-flex items-center justify-center p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                                                        title="Ver Soporte"
                                                    >
                                                        <FileText className="w-4 h-4" />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => {
                                                        setUploadPaymentId(payment.id)
                                                        document.getElementById('payment-upload-input')?.click()
                                                    }}
                                                    className={`p - 1 rounded ${payment.supportFileUrl ? 'text-gray-400 hover:bg-gray-100' : 'text-amber-600 hover:bg-amber-50'} `}
                                                    title={payment.supportFileUrl ? "Reemplazar Soporte" : "Subir Soporte Firmado"}
                                                >
                                                    <UploadIcon className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                {payment.status === 'DRAFT' && (
                                                    <button
                                                        onClick={() => handleApprovePayment(payment)}
                                                        className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                                        title="Aprobar Borrador"
                                                    >
                                                        <Check className="w-4 h-4" />
                                                    </button>
                                                )}
                                                {payment.hasPendingInvoice && (
                                                    <button
                                                        onClick={() => setLinkInvoicePayment(payment)}
                                                        className="p-1.5 bg-orange-50 hover:bg-orange-100 rounded-lg text-orange-600"
                                                        title="Asociar Factura"
                                                    >
                                                        <FileText className="w-4 h-4" />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => setEditPayment(payment)}
                                                    disabled={!!payment.monthlyReportId}
                                                    className="p-1.5 bg-gray-50 hover:bg-gray-100 rounded-lg text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                                                    title={payment.monthlyReportId ? 'No se puede editar (incluido en cierre)' : 'Editar Pago'}
                                                >
                                                    <Edit className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        setShowDeleteConfirm(payment)
                                                    }}
                                                    disabled={deletingId === payment.id || !!payment.monthlyReportId}
                                                    className="p-1.5 bg-red-50 hover:bg-red-100 rounded-lg text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                                    title={payment.monthlyReportId ? 'No se puede eliminar (incluido en cierre)' : 'Eliminar Pago'}
                                                >
                                                    {deletingId === payment.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        setFeedbackItem({ id: payment.id, type: 'PAYMENT' })
                                                        setShowFeedbackModal(true)
                                                    }}
                                                    className="p-1.5 text-gray-500 hover:bg-gray-100 hover:text-indigo-600 rounded-lg transition-colors"
                                                    title="Comentar / Reportar error IA"
                                                >
                                                    <MessageSquare className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        // Map keys to preview struct
                                                        const UNIT_INFO = {
                                                            name: selectedUnit?.name || 'Unidad',
                                                            taxId: selectedUnit?.taxId || 'N/A',
                                                            address: selectedUnit?.address,
                                                            logoUrl: selectedUnit?.logoUrl,
                                                            city: (selectedUnit as any)?.city,
                                                            defaultElaboratedBy: selectedUnit?.defaultElaboratedBy,
                                                            defaultReviewedBy: selectedUnit?.defaultReviewedBy,
                                                            defaultApprovedBy: selectedUnit?.defaultApprovedBy,
                                                            defaultBankName: selectedUnit?.defaultBankName,
                                                            defaultAccountType: selectedUnit?.defaultAccountType
                                                        }

                                                        // Helper to preview
                                                        import('../lib/pdfGenerator').then(mod => {
                                                            mod.generateReceiptFromPayment(payment as any, UNIT_INFO) // This helper was updated in previous step to use the new generator? 
                                                            // Wait, I messed up. I need to expose a preview helper.

                                                            // Let's create a local wrapper or call the mapped function
                                                            const invoices = (payment.invoiceItems || []).map((item: any) => ({
                                                                invoiceNumber: item.invoice.invoiceNumber,
                                                                invoiceDate: item.invoice.invoiceDate,
                                                                description: item.invoice.description,
                                                                amount: Number(item.amountApplied)
                                                            }))

                                                            mod.openPaymentReceiptPreview({
                                                                unitName: UNIT_INFO.name,
                                                                unitNit: UNIT_INFO.taxId,
                                                                unitAddress: UNIT_INFO.address,
                                                                unitCity: UNIT_INFO.city,
                                                                consecutiveNumber: payment.consecutiveNumber ?? null,
                                                                paymentDate: payment.paymentDate,
                                                                providerName: payment.provider?.name || 'N/A',
                                                                providerNit: (payment.provider as any)?.nit || '',
                                                                providerDv: (payment.provider as any)?.dv || '',
                                                                providerCity: (payment.provider as any)?.city || 'Cali',
                                                                providerPhone: (payment.provider as any)?.phone || '',
                                                                invoices: invoices,
                                                                grossAmount: Number(payment.amountPaid),
                                                                retefuente: Number(payment.retefuenteApplied),
                                                                reteica: Number(payment.reteicaApplied),
                                                                netAmount: Number(payment.netValue),
                                                                paymentMethod: payment.bankPaymentMethod,
                                                                bankAccount: (payment.provider as any)?.bankAccount,
                                                                transactionRef: payment.transactionRef,
                                                                logoUrl: UNIT_INFO.logoUrl,
                                                                // Dynamic Fields
                                                                observations: (payment as any).observations,
                                                                referenceNumber: (payment as any).referenceNumber,
                                                                bankName: (payment as any).bankName || UNIT_INFO.defaultBankName,
                                                                accountType: (payment as any).accountType || UNIT_INFO.defaultAccountType,
                                                                elaboratedBy: (payment as any).elaboratedBy || UNIT_INFO.defaultElaboratedBy,
                                                                reviewedBy: (payment as any).reviewedBy || UNIT_INFO.defaultReviewedBy,
                                                                approvedBy: (payment as any).approvedBy || UNIT_INFO.defaultApprovedBy
                                                            })
                                                        })
                                                    }}
                                                    className="p-1.5 bg-indigo-50 hover:bg-indigo-100 rounded-lg text-indigo-600"
                                                    title="Ver/Descargar Comprobante PDF"
                                                >
                                                    <Calculator className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Hidden Input for Uploads */}
                <input
                    type="file"
                    id="payment-upload-input"
                    className="hidden"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={handleFileUpload}
                />
            </div>

            {/* Modal */}
            {
                showModal && (
                    <PaymentModal
                        unitId={unitId}
                        onClose={() => setShowModal(false)}
                        onSuccess={() => {
                            setShowModal(false)
                            queryClient.invalidateQueries({ queryKey: ['payments'] })
                            queryClient.invalidateQueries({ queryKey: ['invoices'] })
                        }}
                    />
                )
            }

            {/* Link Invoice Modal */}
            {
                linkInvoicePayment && (
                    <LinkInvoiceModal
                        payment={linkInvoicePayment}
                        unitId={unitId}
                        onClose={() => setLinkInvoicePayment(null)}
                        onSuccess={() => {
                            setLinkInvoicePayment(null)
                            queryClient.invalidateQueries({ queryKey: ['payments'] })
                            queryClient.invalidateQueries({ queryKey: ['invoices'] })
                        }}
                    />
                )
            }

            {/* Edit Payment Modal */}
            {
                editPayment && (
                    <PaymentModal
                        unitId={unitId}
                        payment={editPayment}
                        onClose={() => setEditPayment(null)}
                        onSuccess={() => {
                            setEditPayment(null)
                            queryClient.invalidateQueries({ queryKey: ['payments'] })
                            queryClient.invalidateQueries({ queryKey: ['invoices'] })
                        }}
                    />
                )
            }

            {/* Delete Confirmation Modal */}
            {
                showDeleteConfirm && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-scale-in">
                            <div className="flex items-center gap-3 text-amber-600 mb-4">
                                <div className="p-2 bg-amber-50 rounded-lg">
                                    <AlertTriangle className="w-6 h-6" />
                                </div>
                                <h3 className="text-xl font-bold text-gray-900">¿Eliminar Egreso?</h3>
                            </div>

                            <p className="text-gray-600 mb-6">
                                Estás a punto de eliminar el comprobante <span className="font-mono font-bold text-gray-900">
                                    {showDeleteConfirm.consecutiveNumber ? `CE - ${String(showDeleteConfirm.consecutiveNumber).padStart(4, '0')} ` : 'Sin CE'}
                                </span> de {showDeleteConfirm.provider?.name || 'este proveedor'}.
                                Esta acción desasociará cualquier factura pagada con este egreso.
                            </p>

                            <div className="flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowDeleteConfirm(null)}
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={confirmDelete}
                                    disabled={deletingId !== null}
                                    className="px-6 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors shadow-lg shadow-red-200 disabled:opacity-50 flex items-center gap-2"
                                >
                                    {deletingId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                    {deletingId ? 'Eliminando...' : 'Sí, Eliminar'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {
                showFeedbackModal && feedbackItem && (
                    <FeedbackModal
                        isOpen={showFeedbackModal}
                        onClose={() => setShowFeedbackModal(false)}
                        unitId={unitId}
                        documentType="PAYMENT"
                        referenceId={feedbackItem.id}
                    />
                )
            }
        </>
    )
}

// Link Invoice Modal - for associating invoice to pending payment
function LinkInvoiceModal({ payment, unitId, onClose, onSuccess }: {
    payment: Payment;
    unitId: string;
    onClose: () => void;
    onSuccess: () => void
}) {
    const [selectedInvoiceId, setSelectedInvoiceId] = useState('')
    const [amount, setAmount] = useState(Number(payment.amountPaid) || 0)
    const [loading, setLoading] = useState(false)

    const { data: allInvoicesData } = useQuery({
        queryKey: ['invoices-all-payable', unitId],
        queryFn: () => getInvoices({ unitId })
    })

    const PAYABLE_STATUSES = ['PENDING', 'PARTIALLY_PAID', 'OVERDUE']

    const pendingInvoices = [
        ...(allInvoicesData?.invoices || []).filter(inv => PAYABLE_STATUSES.includes(inv.status))
    ]

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedInvoiceId) {
            alert('Seleccione una factura')
            return
        }

        setLoading(true)
        try {
            await linkInvoiceToPayment(payment.id, selectedInvoiceId, amount)
            onSuccess()
        } catch (error) {
            console.error(error)
            alert('Error al asociar factura')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
            <div className="bg-white rounded-card shadow-2xl w-full max-w-md flex flex-col max-h-[80vh] overflow-hidden animate-scale-in">
                <div className="flex items-center justify-between p-4 border-b border-gray-100">
                    <h2 className="text-lg font-bold text-gray-900">Asociar Factura</h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full text-gray-400 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-card">
                        <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-1">Pago Seleccionado</p>
                        <p className="text-sm font-bold text-indigo-900">CE-{String(payment.consecutiveNumber).padStart(4, '0')}</p>
                        <p className="text-2xl font-black text-indigo-600 mt-1">{formatMoney(Number(payment.amountPaid))}</p>
                    </div>

                    <form id="link-invoice-form" onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Seleccionar Factura Pendiente</label>
                            <select
                                value={selectedInvoiceId}
                                onChange={(e) => setSelectedInvoiceId(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-input text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                                required
                            >
                                <option value="">-- Buscar factura... --</option>
                                {pendingInvoices.map((inv: any) => (
                                    <option key={inv.id} value={inv.id}>
                                        {inv.invoiceNumber} - {inv.provider?.name} ({formatMoney(Number(inv.balance || inv.totalAmount))})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Monto a Aplicar</label>
                            <input
                                type="number"
                                value={amount}
                                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-input text-sm font-bold focus:ring-2 focus:ring-brand-500 outline-none"
                                required
                            />
                        </div>
                    </form>
                </div>

                <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3 sticky bottom-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-button"
                    >
                        Cancelar
                    </button>
                    <button
                        form="link-invoice-form"
                        type="submit"
                        disabled={loading || !selectedInvoiceId}
                        className="px-6 py-2 bg-brand-primary hover:bg-brand-700 text-white text-sm font-bold rounded-button shadow-lg shadow-brand-200 transition-all disabled:opacity-40 flex items-center gap-2"
                    >
                        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                        Asociar Factura
                    </button>
                </div>
            </div>
        </div>
    )
}

// Payment Modal with multi-invoice support (create and edit modes)
function PaymentModal({ unitId, onClose, onSuccess, payment }: {
    unitId: string;
    onClose: () => void;
    onSuccess: () => void;
    payment?: any; // Optional: if provided, modal is in edit mode
}) {
    const { selectedUnit } = useUnit()
    const isEditMode = !!payment

    const [form, setForm] = useState({
        paymentDate: payment?.paymentDate?.split('T')[0] || new Date().toISOString().split('T')[0],
        sourceType: (payment?.sourceType || selectedUnit?.defaultPaymentType || 'INTERNAL') as 'INTERNAL' | 'EXTERNAL',
        bankPaymentMethod: payment?.bankPaymentMethod || '',
        transactionRef: payment?.transactionRef || '',
        manualConsecutive: payment?.manualConsecutive || '',
        observations: payment?.observations || '',
        referenceNumber: payment?.referenceNumber || '',
        bankName: payment?.bankName || '',
        accountType: payment?.accountType || '',
        elaboratedBy: payment?.elaboratedBy || '',
        reviewedBy: payment?.reviewedBy || '',
        approvedBy: payment?.approvedBy || ''
    })

    const [selectedInvoices, setSelectedInvoices] = useState<Map<string, { invoice: Invoice & { provider?: Provider; balance?: number }, amount: number }>>(() => {
        if (payment?.invoiceItems && payment.invoiceItems.length > 0) {
            const map = new Map()
            payment.invoiceItems.forEach((item: any) => {
                if (item.invoice) {
                    map.set(item.invoice.id, {
                        invoice: item.invoice,
                        amount: Number(item.amountApplied)
                    })
                }
            })
            return map
        }
        return new Map()
    })
    const [providerFilter, setProviderFilter] = useState('')
    const [autoCalculate, setAutoCalculate] = useState(!isEditMode)
    const [retentions, setRetentions] = useState({
        retefuente: Number(payment?.retefuenteApplied || 0),
        reteica: Number(payment?.reteicaApplied || 0)
    })

    const [fileUrl, setFileUrl] = useState<string | null>(payment?.supportFileUrl || null)
    const [file, setFile] = useState<File | null>(null)
    const [uploading, setUploading] = useState(false)
    const [manualAmount, setManualAmount] = useState(Number(payment?.amountPaid || 0))
    const [analyzing, setAnalyzing] = useState(false)
    const [aiError, setAiError] = useState<string | null>(null)

    const { data: allInvoicesData } = useQuery({
        queryKey: ['invoices-all-payable', unitId],
        queryFn: () => getInvoices({ unitId }) // Fetch all to filter locally
    })

    const { data: providersData } = useQuery({
        queryKey: ['providers'],
        queryFn: () => getProviders()
    })

    const PAYABLE_STATUSES = ['PENDING', 'PARTIALLY_PAID', 'OVERDUE']

    const pendingInvoices: (Invoice & { provider?: { id: string; name: string; defaultRetefuentePerc: number; defaultReteicaPerc: number }; balance?: number })[] = [
        ...(allInvoicesData?.invoices || []).filter(inv => PAYABLE_STATUSES.includes(inv.status))
    ]

    const associatedInvoices = payment?.invoiceItems?.map((item: any) => item.invoice).filter(Boolean) || []

    const allAvailableInvoices = [
        ...pendingInvoices,
        ...associatedInvoices.filter((inv: any) => !pendingInvoices.some(p => p.id === inv.id))
    ]

    const providers = providersData?.providers || []

    const filteredInvoices = providerFilter
        ? allAvailableInvoices.filter(i => i.providerId === providerFilter)
        : allAvailableInvoices

    const invoicesByProvider = filteredInvoices.reduce((acc, inv) => {
        const provName = inv.provider?.name || 'Sin proveedor'
        if (!acc[provName]) acc[provName] = []
        acc[provName].push(inv)
        return acc
    }, {} as Record<string, typeof filteredInvoices>)

    const handleAIExtract = async (file: File) => {
        setAnalyzing(true)
        setAiError(null)
        try {
            const analysis = await analyzeDocument(file, unitId)
            if (analysis.type === 'PAYMENT_RECEIPT' && analysis.data) {
                const data = analysis.data
                setForm(f => ({
                    ...f,
                    paymentDate: data.date || f.paymentDate,
                    transactionRef: data.transactionRef || f.transactionRef
                }))
                setManualAmount(data.totalAmount || 0)

                if (data.nit) {
                    const cleanNit = data.nit.replace(/[^0-9]/g, '')
                    const provider = providers.find((p: any) => p.nit.replace(/[^0-9]/g, '') === cleanNit)
                    if (provider) setProviderFilter(provider.id)
                }
            } else {
                setAiError('No se pudo extraer información clara del comprobante.')
            }
        } catch (err) {
            setAiError('Error al procesar con IA.')
        } finally {
            setAnalyzing(false)
        }
    }

    const toggleInvoice = (invoice: Invoice & { provider?: Provider; balance?: number }) => {
        const newSelected = new Map(selectedInvoices)
        if (newSelected.has(invoice.id)) {
            newSelected.delete(invoice.id)
        } else {
            newSelected.set(invoice.id, { invoice, amount: Number(invoice.balance || invoice.totalAmount) })
        }
        setSelectedInvoices(newSelected)
    }

    const updateAmount = (invoiceId: string, amount: number) => {
        const newSelected = new Map(selectedInvoices)
        const entry = newSelected.get(invoiceId)
        if (entry) {
            newSelected.set(invoiceId, { ...entry, amount })
            setSelectedInvoices(newSelected)
        }
    }

    const items = Array.from(selectedInvoices.values())
    const totalSelected = items.reduce((sum, item) => sum + item.amount, 0)

    useEffect(() => {
        if (autoCalculate) {
            let totalRetefuente = 0
            let totalReteica = 0

            // Nueva lógica: heredar retenciones de las facturas seleccionadas
            items.forEach(({ invoice }) => {
                totalRetefuente += Number(invoice.retefuenteAmount || 0)
                totalReteica += Number(invoice.reteicaAmount || 0)
            })

            setRetentions({ retefuente: totalRetefuente, reteica: totalReteica })
        }
    }, [items, autoCalculate])

    const grossAmount = items.length > 0 ? totalSelected : manualAmount
    const netAmount = grossAmount - retentions.retefuente - retentions.reteica

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        const selectedDate = new Date(form.paymentDate)
        const tomorrow = new Date()
        tomorrow.setHours(23, 59, 59, 999)
        if (selectedDate > tomorrow) {
            alert('La fecha de pago no puede ser futura.')
            return
        }

        setUploading(true)
        try {
            // File is already uploaded by SmartFileUploader
            // if (file) { ... }

            // Ensure we use the freshly uploaded URL or the existing one
            // Note: If we are in edit mode, payment?.supportFileUrl is the fallback
            // But if user removed it, fileUrl handles that state.

            const payload = {
                ...form,
                amountPaid: grossAmount,
                retefuenteApplied: retentions.retefuente,
                reteicaApplied: retentions.reteica,
                netValue: netAmount,
                supportFileUrl: fileUrl || undefined,
                unitId,
                invoiceAllocations: items.map(item => ({
                    invoiceId: item.invoice.id,
                    amount: item.amount
                }))
            }

            if (isEditMode) {
                await updatePayment(payment.id, payload)
            } else {
                await createPayment(payload)
            }
            onSuccess()
        } catch (error) {
            console.error(error)
            alert('Error al guardar el egreso')
        } finally {
            setUploading(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
            <div className="bg-white rounded-card shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden animate-scale-in">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-white">
                    <h2 className="text-lg font-bold text-gray-900">
                        {isEditMode ? `Editar Egreso ${payment.consecutiveNumber ? `CE-${String(payment.consecutiveNumber).padStart(4, '0')}` : ''}` : 'Nuevo Egreso (Comprobante)'}
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body (Scrollable) */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    <form id="payment-form" onSubmit={handleSubmit} className="space-y-6">
                        {/* Section: Context */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Pago</label>
                                <input
                                    type="date"
                                    value={form.paymentDate}
                                    onChange={(e) => setForm(f => ({ ...f, paymentDate: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-input text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Origen / Tipo</label>
                                <select
                                    value={form.sourceType}
                                    onChange={(e) => setForm(f => ({ ...f, sourceType: e.target.value as any }))}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-input text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                                >
                                    <option value="INTERNAL">📄 Interno (Caja/Banco Propio)</option>
                                    <option value="EXTERNAL">📤 Externo (Importado/Gmail)</option>
                                </select>
                            </div>
                        </div>

                        {/* Section: Support Upload & IA */}
                        <div className="space-y-3">
                            <SmartFileUploader
                                folder={`units/${unitId}/payments`}
                                onUploadComplete={(url, uploadedFile) => {
                                    setFileUrl(url)
                                    setFile(uploadedFile)
                                }}
                                currentFileUrl={fileUrl}
                                onRemove={() => {
                                    setFileUrl(null)
                                    setFile(null)
                                }}
                                label="Soporte de Pago (Opcional)"
                            />

                            {file && (
                                <button
                                    type="button"
                                    onClick={() => handleAIExtract(file)}
                                    disabled={analyzing}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-brand-50 text-brand-700 rounded-button text-sm font-bold hover:bg-brand-100 transition-colors disabled:opacity-50 border border-brand-200"
                                >
                                    {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                    {analyzing ? 'Analizando documento...' : 'Auto-completar datos con IA ✨'}
                                </button>
                            )}
                            {aiError && <p className="text-xs text-red-600 font-medium text-center">{aiError}</p>}
                        </div>

                        {/* Section: Payment Details */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Medio de Pago</label>
                                <select
                                    value={form.bankPaymentMethod}
                                    onChange={(e) => setForm(f => ({ ...f, bankPaymentMethod: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-input text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                                >
                                    <option value="">Seleccionar...</option>
                                    <option value="TRANSFER">Transferencia</option>
                                    <option value="CHECK">Cheque</option>
                                    <option value="CASH">Efectivo</option>
                                    <option value="PSE">PSE</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Referencia / Transacción</label>
                                <input
                                    type="text"
                                    value={form.transactionRef}
                                    onChange={(e) => setForm(f => ({ ...f, transactionRef: e.target.value }))}
                                    placeholder="Número de comprobante o referencia"
                                    className="w-full px-3 py-2 border border-gray-200 rounded-input text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                                />
                            </div>
                        </div>

                        {/* Section: Invoices Selection */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-brand-600" />
                                    Facturas Asociadas
                                </h3>
                                <select
                                    value={providerFilter}
                                    onChange={(e) => setProviderFilter(e.target.value)}
                                    className="text-xs border-gray-200 rounded-lg py-1 px-2 focus:ring-brand-500 outline-none"
                                >
                                    <option value="">Filtrar proveedor</option>
                                    {providers.map((p: Provider) => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                                {Object.entries(invoicesByProvider).map(([provName, invoices]) => (
                                    <div key={provName} className="mb-4">
                                        <h4 className="text-[11px] font-bold text-gray-400 uppercase mb-2 tracking-wide">{provName}</h4>
                                        <div className="space-y-2">
                                            {(invoices as (Invoice & { provider?: any; balance?: number })[]).map((inv: Invoice & { provider?: any; balance?: number }) => (
                                                <div
                                                    key={inv.id}
                                                    className={`flex items-center justify-between p-3 rounded-card border transition-all cursor-pointer ${selectedInvoices.has(inv.id) ? 'border-brand-300 bg-brand-50/50' : 'border-gray-100 bg-white hover:border-gray-200'}`}
                                                    onClick={() => toggleInvoice(inv)}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedInvoices.has(inv.id)}
                                                            onChange={() => { }} // Handled by div click
                                                            className="w-4 h-4 text-brand-600 rounded border-gray-300 pointer-events-none"
                                                        />
                                                        <div>
                                                            <p className="text-sm font-bold text-gray-900">{inv.invoiceNumber}</p>
                                                            <p className="text-xs text-gray-500">{new Date(inv.invoiceDate).toLocaleDateString()}</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right flex flex-col items-end gap-1">
                                                        <p className="text-xs font-medium text-gray-400">Saldo: {formatMoney(Number(inv.balance || inv.totalAmount))}</p>
                                                        {selectedInvoices.has(inv.id) && (
                                                            <input
                                                                type="number"
                                                                value={selectedInvoices.get(inv.id)?.amount}
                                                                onClick={(e) => e.stopPropagation()}
                                                                onChange={(e) => updateAmount(inv.id, Number(e.target.value))}
                                                                className="w-24 px-2 py-1 text-right text-sm border-brand-200 border rounded font-bold text-brand-700 focus:ring-1 focus:ring-brand-500 outline-none"
                                                            />
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {items.length === 0 && (
                                <div className="p-4 bg-amber-50 rounded-card border border-amber-100">
                                    <div className="flex items-center gap-2 mb-2">
                                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                                        <p className="text-sm font-bold text-amber-800">Pago sin factura asociada</p>
                                    </div>
                                    <p className="text-xs text-amber-700 mb-3">Ingresa el monto bruto manualmente. Podrás asociar la factura más tarde.</p>
                                    <input
                                        type="number"
                                        value={manualAmount || ''}
                                        onChange={(e) => setManualAmount(Number(e.target.value) || 0)}
                                        placeholder="Valor total del egreso"
                                        className="w-full px-3 py-2 border border-amber-200 rounded-input text-sm font-bold focus:ring-2 focus:ring-amber-500 outline-none"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Section: Totals & Retentions */}
                        <div className="bg-brand-900 text-white p-4 rounded-card shadow-lg">
                            <div className="flex items-center justify-between mb-4 border-b border-brand-800 pb-2">
                                <h3 className="text-xs font-bold uppercase tracking-widest text-brand-300">Resumen y Retenciones</h3>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={autoCalculate}
                                        onChange={(e) => setAutoCalculate(e.target.checked)}
                                        className="w-3 h-3 text-brand-600 bg-brand-800 border-none rounded"
                                    />
                                    <span className="text-[10px] font-bold text-brand-300">Auto-calcular</span>
                                </label>
                            </div>

                            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                                <div className="space-y-1">
                                    <span className="text-[10px] text-brand-400 font-bold uppercase">Rete-Fuente</span>
                                    <input
                                        type="number"
                                        value={retentions.retefuente || ''}
                                        onChange={(e) => setRetentions({ ...retentions, retefuente: Number(e.target.value) || 0 })}
                                        disabled={autoCalculate}
                                        className="w-full bg-brand-800 border-none rounded px-2 py-1 text-sm font-bold disabled:opacity-50"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <span className="text-[10px] text-brand-400 font-bold uppercase">Rete-ICA</span>
                                    <input
                                        type="number"
                                        value={retentions.reteica || ''}
                                        onChange={(e) => setRetentions({ ...retentions, reteica: Number(e.target.value) || 0 })}
                                        disabled={autoCalculate}
                                        className="w-full bg-brand-800 border-none rounded px-2 py-1 text-sm font-bold disabled:opacity-50"
                                    />
                                </div>
                                <div className="col-span-2 pt-2 flex items-center justify-between">
                                    <div>
                                        <p className="text-[10px] text-brand-400 font-bold uppercase">Monto Bruto</p>
                                        <p className="text-lg font-bold">{formatMoney(grossAmount)}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] text-brand-400 font-bold uppercase">Neto a Pagar</p>
                                        <p className="text-3xl font-black text-emerald-400">{formatMoney(netAmount)}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Section: Custom Receipt Details */}
                        <div className="pt-4 border-t border-gray-100 space-y-4">
                            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                <MessageSquare className="w-4 h-4 text-brand-600" />
                                Detalles para el Comprobante (Opcional)
                            </h3>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones</label>
                                <textarea
                                    value={form.observations}
                                    onChange={(e) => setForm(f => ({ ...f, observations: e.target.value }))}
                                    placeholder="Notas específicas para este pago..."
                                    rows={2}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-input text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">No. Cheque / Ref</label>
                                    <input
                                        type="text"
                                        value={form.referenceNumber}
                                        onChange={(e) => setForm(f => ({ ...f, referenceNumber: e.target.value }))}
                                        placeholder="Ej: 52525773"
                                        className="w-full px-3 py-2 border border-gray-200 rounded-input text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                                    />
                                </div>
                                <div className="flex gap-4">
                                    <div className="flex-1">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Banco (Manual)</label>
                                        <input
                                            type="text"
                                            value={form.bankName}
                                            onChange={(e) => setForm(f => ({ ...f, bankName: e.target.value }))}
                                            placeholder={selectedUnit?.defaultBankName || 'Nombre del banco'}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-input text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Elaborado</label>
                                    <input
                                        type="text"
                                        value={form.elaboratedBy}
                                        onChange={(e) => setForm(f => ({ ...f, elaboratedBy: e.target.value }))}
                                        placeholder={selectedUnit?.defaultElaboratedBy || 'Nombre'}
                                        className="w-full px-2 py-1.5 border border-gray-200 rounded-input text-xs"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Revisado</label>
                                    <input
                                        type="text"
                                        value={form.reviewedBy}
                                        onChange={(e) => setForm(f => ({ ...f, reviewedBy: e.target.value }))}
                                        placeholder={selectedUnit?.defaultReviewedBy || 'Nombre'}
                                        className="w-full px-2 py-1.5 border border-gray-200 rounded-input text-xs"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Aprobado</label>
                                    <input
                                        type="text"
                                        value={form.approvedBy}
                                        onChange={(e) => setForm(f => ({ ...f, approvedBy: e.target.value }))}
                                        placeholder={selectedUnit?.defaultApprovedBy || 'Nombre'}
                                        className="w-full px-2 py-1.5 border border-gray-200 rounded-input text-xs"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Custom CE Number (Optional) */}
                        {!isEditMode && (
                            <div className="pt-4 border-t border-gray-100 flex items-center gap-4">
                                <label className="text-xs font-bold text-gray-400 uppercase">CE Manual (Opcional):</label>
                                <input
                                    type="number"
                                    value={form.manualConsecutive}
                                    onChange={(e) => setForm(f => ({ ...f, manualConsecutive: e.target.value }))}
                                    placeholder="CE-XXXX"
                                    className="w-24 px-2 py-1 border border-gray-200 rounded text-sm font-mono focus:ring-brand-500 outline-none"
                                    title="Si dejas vacío, el sistema asignará el siguiente comprobante disponible."
                                />
                            </div>
                        )}
                    </form>
                </div>

                {/* Footer (Fixed) */}
                <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3 sticky bottom-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-button transition-all"
                    >
                        Cancelar
                    </button>
                    <button
                        form="payment-form"
                        type="submit"
                        disabled={uploading || (items.length === 0 && manualAmount <= 0)}
                        className="px-8 py-2.5 bg-brand-primary hover:bg-brand-700 text-white text-sm font-bold rounded-button shadow-lg shadow-brand-200 transition-all disabled:opacity-40 transform hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2"
                    >
                        {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
                        {uploading ? 'Procesando...' : (isEditMode ? 'Actualizar Egreso' : 'Registrar Egreso')}
                    </button>
                </div>
            </div>
        </div>
    )
}
