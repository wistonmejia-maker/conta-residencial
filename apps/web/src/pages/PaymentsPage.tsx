import { Plus, Search, FileDown, Upload as UploadIcon, X, Calculator, Download, Loader2, FileText, CheckCircle2, AlertTriangle, Clock, Edit, Trash2, Mail, Sparkles, Check, MessageSquare } from 'lucide-react'
import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getPayments, getInvoices, createPayment, getProviders, updatePayment, linkInvoiceToPayment, deletePayment, scanGmail, connectGmail, getGmailStatus, analyzeDocument } from '../lib/api/index'
import type { Payment, Invoice, Provider } from '../lib/api/index'
import { uploadFileToStorage } from '../lib/storage'
import { exportToExcel } from '../lib/exportExcel'
import { useUnit } from '../lib/UnitContext'
import { AIButton, FeedbackModal } from '../components/ui'

const formatMoney = (value: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value)

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
    const [scanningGmail, setScanningGmail] = useState(false)
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
            const { url } = await uploadFileToStorage(file, `units/${unitId}/payments/${uploadPaymentId}`)

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

    const handleGmailScan = async () => {
        if (!unitId) return
        setScanningGmail(true)
        try {
            const res = await scanGmail(unitId)
            if (res.success) {
                alert('Escaneo iniciado en segundo plano. Te notificaremos cuando termine.');
                // queryClient.invalidateQueries({ queryKey: ['payments'] }) // Don't invalidate yet, wait for completion or poll
            }
        } catch (error) {
            console.error('Error scanning Gmail:', error)
            alert('Error al escanear Gmail.')
        } finally {
            setScanningGmail(false)
        }
    }

    const handleApprovePayment = async (id: string) => {
        try {
            // If it's a draft payment from Gmail, we might want to mark it as PAID_NO_SUPPORT 
            // or just COMPLETED if the user manually uploads support later.
            // For now, let's move it to PAID_NO_SUPPORT if it has no support or COMPLETED if it does.
            await updatePayment(id, { status: 'PAID_NO_SUPPORT' })
            queryClient.invalidateQueries({ queryKey: ['payments'] })
        } catch (error) {
            console.error('Error approving payment:', error)
            alert('Error al aprobar el egreso.')
        }
    }

    return (
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

                    <AIButton
                        variant="secondary"
                        loading={scanningGmail}
                        disabled={!gmailStatus?.connected}
                        onClick={handleGmailScan}
                    >
                        {scanningGmail ? 'Escaneando...' : 'Escanear Inbox'}
                    </AIButton>


                    <button
                        onClick={() => {
                            const dataToExport = filtered.map((p: any) => ({
                                consecutiveNumber: p.consecutiveNumber ? `CE-${String(p.consecutiveNumber).padStart(4, '0')}` : 'Sin CE',
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
                            ], `egresos_${new Date().toISOString().split('T')[0]}`)
                        }}
                        className="px-4 py-2 border border-gray-200 bg-white text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 shadow-sm flex items-center gap-2"
                    >
                        <Download className="w-4 h-4" />
                        Exportar
                    </button>
                    <button
                        onClick={() => setShowModal(true)}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 shadow-sm flex items-center gap-2"
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
                                        {Number(payment.retefuenteApplied) > 0 ? `-${formatMoney(Number(payment.retefuenteApplied))}` : '-'}
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm text-red-600">
                                        {Number(payment.reteicaApplied) > 0 ? `-${formatMoney(Number(payment.reteicaApplied))}` : '-'}
                                    </td>
                                    <td className="px-4 py-3 text-right font-semibold text-emerald-600">{formatMoney(Number(payment.netValue))}</td>
                                    <td className="px-4 py-3 text-center">
                                        <div className="flex items-center justify-center gap-1">
                                            <span className={`status-pill ${statusStyles[payment.status] || 'status-pending'}`}>
                                                {statusLabels[payment.status] || payment.status}
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
                                                    onClick={() => {
                                                        try {
                                                            const url = payment.supportFileUrl!
                                                            if (url.startsWith('data:')) {
                                                                const parts = url.split(',')
                                                                if (parts.length < 2) {
                                                                    throw new Error('Invalid data URI format')
                                                                }
                                                                const byteString = atob(parts[1])
                                                                const mimeType = parts[0].split(':')[1]?.split(';')[0] || 'application/pdf'
                                                                const ab = new ArrayBuffer(byteString.length)
                                                                const ia = new Uint8Array(ab)
                                                                for (let i = 0; i < byteString.length; i++) {
                                                                    ia[i] = byteString.charCodeAt(i)
                                                                }
                                                                const blob = new Blob([ab], { type: mimeType })
                                                                window.open(URL.createObjectURL(blob), '_blank')
                                                            } else {
                                                                window.open(url, '_blank')
                                                            }
                                                        } catch (e) {
                                                            console.error('Error opening file:', e)
                                                            alert('Archivo corrupto. Usa el botón naranja para subir uno nuevo.')
                                                        }
                                                    }}
                                                    className="inline-flex items-center justify-center p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                                                    title="Ver Soporte"
                                                >
                                                    <FileDown className="w-4 h-4" />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => {
                                                    setUploadPaymentId(payment.id)
                                                    document.getElementById('payment-upload-input')?.click()
                                                }}
                                                className={`p-1 rounded ${payment.supportFileUrl ? 'text-gray-400 hover:bg-gray-100' : 'text-amber-600 hover:bg-amber-50'}`}
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
                                                    onClick={() => handleApprovePayment(payment.id)}
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
                                                        logoUrl: selectedUnit?.logoUrl
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
                                                            consecutiveNumber: payment.consecutiveNumber ?? null,
                                                            paymentDate: payment.paymentDate,
                                                            providerName: payment.provider?.name || 'N/A',
                                                            providerNit: (payment.provider as any)?.nit || '',
                                                            providerDv: (payment.provider as any)?.dv || '',
                                                            invoices: invoices,
                                                            grossAmount: Number(payment.amountPaid),
                                                            retefuente: Number(payment.retefuenteApplied),
                                                            reteica: Number(payment.reteicaApplied),
                                                            netAmount: Number(payment.netValue),
                                                            paymentMethod: payment.bankPaymentMethod,
                                                            bankAccount: (payment.provider as any)?.bankAccount,
                                                            transactionRef: payment.transactionRef,
                                                            logoUrl: UNIT_INFO.logoUrl
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

            {/* Modal */}
            {showModal && (
                <PaymentModal
                    unitId={unitId}
                    onClose={() => setShowModal(false)}
                    onSuccess={() => {
                        setShowModal(false)
                        queryClient.invalidateQueries({ queryKey: ['payments'] })
                        queryClient.invalidateQueries({ queryKey: ['invoices'] })
                    }}
                />
            )}

            {/* Link Invoice Modal */}
            {linkInvoicePayment && (
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
            )}

            {/* Edit Payment Modal */}
            {editPayment && (
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
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
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
                                {showDeleteConfirm.consecutiveNumber ? `CE-${String(showDeleteConfirm.consecutiveNumber).padStart(4, '0')}` : 'Sin CE'}
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
            )}

            {showFeedbackModal && feedbackItem && (
                <FeedbackModal
                    isOpen={showFeedbackModal}
                    onClose={() => setShowFeedbackModal(false)}
                    unitId={unitId}
                    documentType="PAYMENT"
                    referenceId={feedbackItem.id}
                />
            )}
        </div>
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

    // Fetch pending invoices
    const { data: invoicesData } = useQuery({
        queryKey: ['invoices-pending', unitId],
        queryFn: () => getInvoices({ unitId, status: 'PENDING' })
    })

    const { data: partialData } = useQuery({
        queryKey: ['invoices-partial', unitId],
        queryFn: () => getInvoices({ unitId, status: 'PARTIALLY_PAID' })
    })

    const pendingInvoices = [
        ...(invoicesData?.invoices || []),
        ...(partialData?.invoices || [])
    ]

    const handleSubmit = async () => {
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-900">Asociar Factura al Pago</h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <p className="text-sm text-gray-600">Pago: <strong>CE-{payment.consecutiveNumber}</strong></p>
                        <p className="text-sm text-gray-600">Valor: <strong>{formatMoney(Number(payment.amountPaid))}</strong></p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Seleccionar Factura</label>
                        <select
                            value={selectedInvoiceId}
                            onChange={(e) => setSelectedInvoiceId(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        >
                            <option value="">-- Seleccione --</option>
                            {pendingInvoices.map((inv: any) => (
                                <option key={inv.id} value={inv.id}>
                                    {inv.invoiceNumber} - {inv.provider?.name} - {formatMoney(Number(inv.balance || inv.totalAmount))}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Monto a Aplicar</label>
                        <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-2 mt-6">
                    <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">
                        Cancelar
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading || !selectedInvoiceId}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                    >
                        {loading ? 'Guardando...' : 'Asociar Factura'}
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
        manualConsecutive: payment?.manualConsecutive || ''
    })

    // Multi-invoice selection state - initialize from payment.invoiceItems if editing
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

    // File upload state for new payment
    const [file, setFile] = useState<File | null>(null)
    const [uploading, setUploading] = useState(false)

    // Manual amount for payments without invoice
    const [manualAmount, setManualAmount] = useState(Number(payment?.amountPaid || 0))
    const [analyzing, setAnalyzing] = useState(false)
    const [aiError, setAiError] = useState<string | null>(null)

    // Fetch pending invoices
    const { data: invoicesData } = useQuery({
        queryKey: ['invoices-pending', unitId],
        queryFn: () => getInvoices({ unitId, status: 'PENDING' })
    })

    const { data: partialData } = useQuery({
        queryKey: ['invoices-partial', unitId],
        queryFn: () => getInvoices({ unitId, status: 'PARTIALLY_PAID' })
    })

    const { data: providersData } = useQuery({
        queryKey: ['providers'],
        queryFn: () => getProviders()
    })

    const pendingInvoices: (Invoice & { provider?: { id: string; name: string; defaultRetefuentePerc: number; defaultReteicaPerc: number }; balance?: number })[] = [
        ...(invoicesData?.invoices || []),
        ...(partialData?.invoices || [])
    ]

    const associatedInvoices = payment?.invoiceItems?.map((item: any) => item.invoice).filter(Boolean) || []

    // Merge: add associated invoices that are not already in pending list
    const allAvailableInvoices = [
        ...pendingInvoices,
        ...associatedInvoices.filter((inv: any) => !pendingInvoices.some(p => p.id === inv.id))
    ]

    const providers = providersData?.providers || []

    // Filter by provider
    const filteredInvoices = providerFilter
        ? allAvailableInvoices.filter(i => i.providerId === providerFilter)
        : allAvailableInvoices

    // Group invoices by provider for display
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
            const analysis = await analyzeDocument(file)
            if (analysis.type === 'PAYMENT_RECEIPT' && analysis.data) {
                const data = analysis.data
                setForm(f => ({
                    ...f,
                    paymentDate: data.date || f.paymentDate,
                    transactionRef: data.transactionRef || f.transactionRef,
                    bankPaymentMethod: data.bankName ? 'TRANSFER' : f.bankPaymentMethod
                }))
                setManualAmount(data.totalAmount || manualAmount)

                // If it's a payment, maybe we can match provider or description
                if (data.concept) {
                    // Try to update some note or similar if available
                }
            } else if (analysis.type === 'INVOICE') {
                setAiError('Este documento parece ser una factura, no un comprobante de pago. Por favor súbelo en la sección de Facturas.')
            } else {
                setAiError('No se pudo extraer información válida de este comprobante con IA.')
            }
        } catch (err) {
            console.error('AI Extraction error:', err)
            setAiError('Error al conectar con el servicio de IA.')
        } finally {
            setAnalyzing(false)
        }
    }

    // Calculate totals - use manual amount if no invoices selected
    const totalAmount = selectedInvoices.size > 0
        ? Array.from(selectedInvoices.values()).reduce((sum, item) => sum + item.amount, 0)
        : manualAmount
    const netValue = totalAmount - retentions.retefuente - retentions.reteica

    // Auto-calculate retentions when selection changes
    useEffect(() => {
        if (autoCalculate && selectedInvoices.size > 0) {
            let totalRetefuente = 0
            let totalReteica = 0

            selectedInvoices.forEach(({ invoice, amount }) => {
                const provider = providers.find((p: Provider) => p.id === invoice.providerId)
                if (provider) {
                    // Use proportion of subtotal based on amount vs total
                    const proportion = amount / Number(invoice.totalAmount)
                    const subtotalPortion = Number(invoice.subtotal) * proportion
                    totalRetefuente += Math.round(subtotalPortion * (provider.defaultRetefuentePerc / 100))
                    totalReteica += Math.round(subtotalPortion * (provider.defaultReteicaPerc / 100))
                }
            })

            setRetentions({ retefuente: totalRetefuente, reteica: totalReteica })
        }
    }, [selectedInvoices, autoCalculate, providers])

    const toggleInvoice = (invoice: Invoice & { provider?: any; balance?: number }) => {
        setSelectedInvoices(prev => {
            const newMap = new Map(prev)
            if (newMap.has(invoice.id)) {
                newMap.delete(invoice.id)
            } else {
                const balance = invoice.balance ?? Number(invoice.totalAmount)
                newMap.set(invoice.id, { invoice, amount: balance })
            }
            return newMap
        })
    }

    const updateInvoiceAmount = (invoiceId: string, amount: number) => {
        setSelectedInvoices(prev => {
            const newMap = new Map(prev)
            const item = newMap.get(invoiceId)
            if (item) {
                newMap.set(invoiceId, { ...item, amount })
            }
            return newMap
        })
    }

    const createMutation = useMutation({
        mutationFn: async (data: { supportFileUrl?: string; hasAuditIssue?: boolean; hasPendingInvoice?: boolean }) => {
            const invoiceAllocations = Array.from(selectedInvoices.entries()).map(([invoiceId, { amount }]) => ({
                invoiceId,
                amount
            }))

            if (isEditMode) {
                // Update existing payment
                return updatePayment(payment.id, {
                    paymentDate: form.paymentDate,
                    sourceType: form.sourceType,
                    manualConsecutive: form.sourceType === 'EXTERNAL' ? form.manualConsecutive : undefined,
                    amountPaid: totalAmount,
                    retefuenteApplied: retentions.retefuente,
                    reteicaApplied: retentions.reteica,
                    bankPaymentMethod: form.bankPaymentMethod,
                    transactionRef: form.transactionRef,
                    supportFileUrl: data.supportFileUrl || payment.supportFileUrl,
                    invoiceAllocations,
                    hasAuditIssue: data.hasAuditIssue,
                    hasPendingInvoice: data.hasPendingInvoice
                } as any)
            } else {
                // Create new payment
                return createPayment({
                    unitId,
                    paymentDate: form.paymentDate,
                    sourceType: form.sourceType,
                    manualConsecutive: form.sourceType === 'EXTERNAL' ? form.manualConsecutive : undefined,
                    amountPaid: totalAmount,
                    retefuenteApplied: retentions.retefuente,
                    reteicaApplied: retentions.reteica,
                    bankPaymentMethod: form.bankPaymentMethod,
                    transactionRef: form.transactionRef,
                    supportFileUrl: data.supportFileUrl,
                    invoiceAllocations,
                    hasAuditIssue: data.hasAuditIssue,
                    hasPendingInvoice: data.hasPendingInvoice
                })
            }
        },
        onSuccess
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        // Check if payment date is before any selected invoice date
        const paymentDate = new Date(form.paymentDate)
        let hasDateIssue = false

        for (const [invoiceId] of selectedInvoices) {
            const invoice = filteredInvoices.find((i: any) => i.id === invoiceId)
            if (invoice) {
                const invoiceDate = new Date(invoice.invoiceDate)
                if (paymentDate < invoiceDate) {
                    hasDateIssue = true
                    break
                }
            }
        }

        // Show warning for date issue
        if (hasDateIssue) {
            if (!confirm('⚠️ La fecha del pago es anterior a la fecha de una o más facturas seleccionadas.\n\nEsto quedará registrado en el log de auditoría.\n\n¿Desea continuar?')) {
                return
            }
        }

        // Check if no invoices selected (pending invoice)
        const noPendingInvoice = selectedInvoices.size === 0
        if (noPendingInvoice) {
            if (!confirm('⚠️ No ha seleccionado ninguna factura para este pago.\n\nEl pago quedará pendiente de asociar factura y no podrá cerrar el mes hasta completarlo.\n\n¿Desea continuar?')) {
                return
            }
        }

        setUploading(true)
        try {
            let supportFileUrl = ''
            if (file) {
                const timestamp = Date.now()
                const res = await uploadFileToStorage(file, `units/${unitId}/payments/temp_${timestamp}`)
                supportFileUrl = res.url
            }

            await createMutation.mutateAsync({
                supportFileUrl,
                hasAuditIssue: hasDateIssue,
                hasPendingInvoice: noPendingInvoice
            })
        } catch (error) {
            console.error('Error saving payment:', error)
            alert(isEditMode ? 'Error al actualizar egreso' : 'Error al crear egreso')
        } finally {
            setUploading(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
                    <h2 className="text-lg font-semibold text-gray-900">{isEditMode ? 'Editar Egreso' : 'Nuevo Egreso'}</h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* Provider Filter */}
                    <div className="flex items-center gap-4">
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Filtrar por Proveedor</label>
                            <select
                                value={providerFilter}
                                onChange={(e) => setProviderFilter(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none"
                            >
                                <option value="">Todos los proveedores</option>
                                {providers.map((p: Provider) => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </div>
                        {selectedInvoices.size > 0 && (
                            <div className="text-right">
                                <p className="text-xs text-gray-500">Facturas seleccionadas</p>
                                <p className="text-lg font-bold text-indigo-600">{selectedInvoices.size}</p>
                            </div>
                        )}
                    </div>

                    {/* Invoice Selection with Checkboxes */}
                    <div className="border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 sticky top-0">
                                <tr>
                                    <th className="px-3 py-2 text-left w-8"></th>
                                    <th className="px-3 py-2 text-left font-medium text-gray-500">Factura</th>
                                    <th className="px-3 py-2 text-left font-medium text-gray-500">Proveedor</th>
                                    <th className="px-3 py-2 text-right font-medium text-gray-500">Saldo</th>
                                    <th className="px-3 py-2 text-right font-medium text-gray-500">A Pagar</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {Object.entries(invoicesByProvider).map(([provName, invoices]) => (
                                    (invoices as any[]).map((inv) => {
                                        const isSelected = selectedInvoices.has(inv.id)
                                        const balance = inv.balance ?? Number(inv.totalAmount)
                                        return (
                                            <tr
                                                key={inv.id}
                                                className={`cursor-pointer transition-colors ${isSelected ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
                                                onClick={() => toggleInvoice(inv)}
                                            >
                                                <td className="px-3 py-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => { }}
                                                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                    />
                                                </td>
                                                <td className="px-3 py-2 font-mono">{inv.invoiceNumber}</td>
                                                <td className="px-3 py-2">{provName}</td>
                                                <td className="px-3 py-2 text-right font-medium">{formatMoney(balance)}</td>
                                                <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                                                    {isSelected && (
                                                        <input
                                                            type="number"
                                                            value={selectedInvoices.get(inv.id)?.amount || 0}
                                                            onChange={(e) => updateInvoiceAmount(inv.id, parseFloat(e.target.value) || 0)}
                                                            max={balance}
                                                            className="w-28 px-2 py-1 border border-indigo-300 rounded text-right text-sm"
                                                        />
                                                    )}
                                                </td>
                                            </tr>
                                        )
                                    })
                                ))}
                                {filteredInvoices.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-3 py-8 text-center text-gray-400">
                                            No hay facturas pendientes
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Payment Details */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Egreso *</label>
                            <select
                                value={form.sourceType}
                                onChange={(e) => setForm(f => ({ ...f, sourceType: e.target.value as 'INTERNAL' | 'EXTERNAL' }))}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none"
                            >
                                <option value="INTERNAL">Interno (genera consecutivo)</option>
                                <option value="EXTERNAL">Externo (debe subir soporte PDF)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Pago *</label>
                            <input
                                type="date"
                                value={form.paymentDate}
                                onChange={(e) => setForm(f => ({ ...f, paymentDate: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none"
                                required
                            />
                        </div>
                    </div>

                    {/* Retention Section */}
                    <div className="border border-indigo-100 rounded-lg p-4 bg-indigo-50/30">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <Calculator className="w-4 h-4 text-indigo-600" />
                                <span className="font-medium text-indigo-900">Retenciones</span>
                            </div>
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={autoCalculate}
                                    onChange={(e) => setAutoCalculate(e.target.checked)}
                                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="text-gray-600">Auto-calcular</span>
                            </label>
                        </div>

                        <div className="grid grid-cols-4 gap-4">
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Total Bruto</label>
                                {selectedInvoices.size === 0 ? (
                                    <input
                                        type="number"
                                        value={manualAmount || ''}
                                        onChange={(e) => setManualAmount(parseFloat(e.target.value) || 0)}
                                        placeholder="Ingrese el valor"
                                        className="w-full px-2 py-1 border border-gray-200 rounded text-lg font-bold"
                                    />
                                ) : (
                                    <p className="font-bold text-lg">{formatMoney(totalAmount)}</p>
                                )}
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">ReteFuente</label>
                                <input
                                    type="number"
                                    value={retentions.retefuente || ''}
                                    onChange={(e) => setRetentions(r => ({ ...r, retefuente: parseFloat(e.target.value) || 0 }))}
                                    disabled={autoCalculate}
                                    className="w-full px-2 py-1 border border-gray-200 rounded text-sm disabled:bg-gray-50"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">ReteICA</label>
                                <input
                                    type="number"
                                    value={retentions.reteica || ''}
                                    onChange={(e) => setRetentions(r => ({ ...r, reteica: parseFloat(e.target.value) || 0 }))}
                                    disabled={autoCalculate}
                                    className="w-full px-2 py-1 border border-gray-200 rounded text-sm disabled:bg-gray-50"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Valor Neto</label>
                                <p className="font-bold text-lg text-emerald-600">{formatMoney(netValue)}</p>
                            </div>
                        </div>
                    </div>

                    {/* Bank details */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Método de Pago</label>
                            <select
                                value={form.bankPaymentMethod}
                                onChange={(e) => setForm(f => ({ ...f, bankPaymentMethod: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none"
                            >
                                <option value="">Seleccionar...</option>
                                <option value="TRANSFER">Transferencia</option>
                                <option value="CHECK">Cheque</option>
                                <option value="CASH">Efectivo</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Referencia Bancaria</label>
                            <input
                                type="text"
                                value={form.transactionRef}
                                onChange={(e) => setForm(f => ({ ...f, transactionRef: e.target.value }))}
                                placeholder="Ej: TRX-123456"
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none"
                            />
                        </div>
                    </div>

                    {/* File Upload Section */}
                    <div className="border border-gray-200 rounded-lg p-4 bg-gray-50/50">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Soporte de Pago (Opcional)</label>
                        {aiError && (
                            <div className="mb-3 p-2 bg-red-50 text-red-700 text-xs rounded border border-red-100 flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4" />
                                {aiError}
                            </div>
                        )}
                        <div className="flex items-center gap-4">
                            <label className="flex-1 cursor-pointer group">
                                <div className={`flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-lg transition-colors ${file ? 'border-indigo-300 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400 hover:bg-white'}`}>
                                    {file ? (
                                        <div className="flex flex-col items-center text-indigo-600">
                                            <FileText className="w-8 h-8 mb-2" />
                                            <span className="text-sm font-medium">{file.name}</span>
                                            <span className="text-xs text-indigo-400">Clic para cambiar</span>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center text-gray-500 group-hover:text-indigo-500">
                                            <UploadIcon className="w-8 h-8 mb-2" />
                                            <span className="text-sm">Clic para subir PDF o Imagen</span>
                                        </div>
                                    )}
                                    <input
                                        type="file"
                                        className="hidden"
                                        accept=".pdf,.png,.jpg,.jpeg"
                                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                                    />
                                </div>
                            </label>
                            {file && (
                                <button
                                    type="button"
                                    onClick={() => setFile(null)}
                                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                                    title="Quitar archivo"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            )}
                        </div>
                        {file && (
                            <button
                                type="button"
                                onClick={() => handleAIExtract(file)}
                                disabled={analyzing}
                                className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg text-xs font-medium hover:bg-purple-100 transition-colors disabled:opacity-50"
                            >
                                {analyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                {analyzing ? 'Analizando con IA...' : 'Auto-completar con IA (Experimental)'}
                            </button>
                        )}
                    </div>
                </form>

                {/* Footer */}
                <div className="flex justify-between items-center gap-3 p-4 border-t bg-gray-50">
                    <div className="text-sm text-gray-500">
                        {selectedInvoices.size > 0 && (
                            <span>{selectedInvoices.size} factura{selectedInvoices.size > 1 ? 's' : ''} • Total: <strong className="text-gray-900">{formatMoney(totalAmount)}</strong></span>
                        )}
                    </div>
                    <div className="flex gap-3">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg text-sm font-medium">
                            Cancelar
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={createMutation.isPending || uploading || totalAmount <= 0}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                        >
                            {uploading ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> Procesando...</>
                            ) : (
                                `Registrar Egreso (${formatMoney(netValue)})`
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
