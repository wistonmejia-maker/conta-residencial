import { Plus, Search, X, FileText, Upload, Loader2, Download, Trash2, Pencil, Check, AlertTriangle, CheckCircle2, Mail, Sparkles, MessageSquare } from 'lucide-react'
import { useState, useMemo, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getInvoices, getProviders, getInvoiceStats, updateInvoice, getNextCCNumber, deleteInvoice, connectGmail, getGmailStatus, getGmailPreview, analyzeDocument, createProvider, API_BASE } from '../lib/api/index'

import { uploadFileToStorage } from '../lib/storage'
import { exportToExcel } from '../lib/exportExcel'
import { useUnit } from '../lib/UnitContext'
import { useAI } from '../lib/AIContext'
import { AIButton, AIProcessingOverlay, AIConfidenceIndicator, FeedbackModal, SmartFileUploader } from '../components/ui'
import { formatMoney } from '../lib/format'
import { formatRelativeTime } from '../lib/dateUtils'

import type { Invoice, Provider } from '../lib/api/index'


const statusLabels: Record<string, string> = {
    DRAFT: 'Borrador',
    PENDING: 'Pendiente',
    PAID: 'Pagado',
    PARTIALLY_PAID: 'Pago Parcial',
    OVERDUE: 'Vencida',
    VOID: 'Anulada'
}

const statusStyles: Record<string, string> = {
    DRAFT: 'bg-purple-50 text-purple-700 border border-purple-100',
    PENDING: 'bg-amber-100 text-amber-700',
    PAID: 'bg-emerald-100 text-emerald-700',
    PARTIALLY_PAID: 'bg-indigo-100 text-indigo-700',
    OVERDUE: 'bg-red-100 text-red-700',
    VOID: 'bg-gray-100 text-gray-700'
}

function GmailPreviewModal({ unitId, onClose }: { unitId: string; onClose: () => void }) {
    const { data, isLoading, error } = useQuery({
        queryKey: ['gmail-preview', unitId],
        queryFn: () => getGmailPreview(unitId)
    })

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <Mail className="w-5 h-5 text-indigo-600" />
                        Buzón Inteligente (Últimos 10 correos con facturas)
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    {isLoading ? (
                        <div className="py-12 text-center text-gray-500">
                            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-indigo-500" />
                            <p>Cargando correos...</p>
                        </div>
                    ) : error ? (
                        <div className="p-4 bg-red-50 text-red-700 rounded-lg flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5" />
                            Error al cargar la previsualización. Verifica tu conexión.
                        </div>
                    ) : data?.emails?.length === 0 ? (
                        <div className="py-12 text-center text-gray-500">No se encontraron correos recientes.</div>
                    ) : (
                        <div className="space-y-3">
                            {data?.emails?.map((email: any) => (
                                <div key={email.id} className="p-3 border border-gray-200 rounded-lg hover:border-indigo-200 transition-colors">
                                    <div className="flex justify-between items-start mb-1">
                                        <h3 className="font-medium text-gray-900 line-clamp-1">{email.subject || '(Sin asunto)'}</h3>
                                        <span className="text-xs text-gray-500 whitespace-nowrap ml-2">
                                            {email.date ? new Date(email.date).toLocaleDateString() : ''}
                                        </span>
                                    </div>
                                    <div className="text-xs text-gray-600 mb-1 font-medium">{email.from}</div>
                                    <p className="text-xs text-gray-500 line-clamp-2">{email.snippet}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl text-xs text-gray-500">
                    Nota: El escaneo procesa correos con facturas (PDF/ZIP) recibidos desde la fecha configurada en los ajustes del conjunto.
                </div>
            </div>

        </div>
    )
}

function InvoiceModal({ unitId, initialData, onClose, onSuccess }: { unitId: string; initialData?: any; onClose: () => void; onSuccess: () => void }) {
    const { selectedUnit } = useUnit()
    const isEditMode = !!initialData

    const [form, setForm] = useState({
        providerId: initialData?.providerId || '',
        invoiceNumber: initialData?.invoiceNumber || '',
        invoiceDate: initialData?.invoiceDate ? new Date(initialData.invoiceDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        dueDate: initialData?.dueDate ? new Date(initialData.dueDate).toISOString().split('T')[0] : '',
        subtotal: initialData?.subtotal || 0,
        taxIva: initialData?.taxIva || 0,
        retefuenteAmount: initialData?.retefuenteAmount || 0,
        reteicaAmount: initialData?.reteicaAmount || 0,
        totalAmount: initialData?.totalAmount || 0,
        description: initialData?.description || '',
        // Credit Note Support
        documentType: initialData?.documentType || 'FACTURA',
        relatedInvoiceId: initialData?.relatedInvoiceId || '',
        adjustmentReason: initialData?.adjustmentReason || '',
    })

    const [fileUrl, setFileUrl] = useState<string | null>(initialData?.fileUrl || null)
    const [file, setFile] = useState<File | null>(null)
    const [uploading, setUploading] = useState(false)
    const isCuentaDeCobro = form.documentType === 'CUENTA_COBRO'
    const isNotaCredito = form.documentType === 'NOTA_CREDITO'
    const [loadingCCNumber, setLoadingCCNumber] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [validationWarning, setValidationWarning] = useState<string | null>(null)
    const queryClient = useQueryClient()
    const [analyzing, setAnalyzing] = useState(false)
    const [extractedProvider, setExtractedProvider] = useState<{ name: string, nit: string } | null>(null)
    const [creatingProvider, setCreatingProvider] = useState(false)
    const [aiConfidence, setAiConfidence] = useState<number | null>(null)

    const { data: providersData } = useQuery({
        queryKey: ['providers', unitId],
        queryFn: () => getProviders()
    })

    const providers = providersData?.providers || []

    const handleDocumentTypeChange = async (newType: string) => {
        setForm(f => ({ ...f, documentType: newType, relatedInvoiceId: '', adjustmentReason: '' }))
        setError(null)

        if (newType === 'CUENTA_COBRO') {
            setLoadingCCNumber(true)
            try {
                const result = await getNextCCNumber(unitId)
                setForm(f => ({ ...f, invoiceNumber: result.number, documentType: newType }))
            } catch (err) {
                console.error('Error fetching CC number:', err)
                setError('Error al generar número de cuenta de cobro')
            } finally {
                setLoadingCCNumber(false)
            }
        } else if (newType === 'NOTA_CREDITO') {
            setForm(f => ({ ...f, invoiceNumber: '', documentType: newType }))
        } else {
            setForm(f => ({ ...f, invoiceNumber: '', documentType: newType }))
        }
    }

    // Auto-calculate totalAmount based on subtotal and taxIva
    useEffect(() => {
        const calculatedTotal = Number(form.subtotal) + Number(form.taxIva)
        if (calculatedTotal !== form.totalAmount) {
            setForm(f => ({ ...f, totalAmount: calculatedTotal }))
        }
    }, [form.subtotal, form.taxIva])

    // Obtener facturas del mismo proveedor para NC
    const { data: providerInvoicesData } = useQuery({
        queryKey: ['invoices', unitId, form.providerId],
        queryFn: () => getInvoices({ unitId, providerId: form.providerId }),
        enabled: isNotaCredito && !!form.providerId
    })
    const providerInvoices = (providerInvoicesData?.invoices || []).filter(
        (inv: any) => inv.documentType !== 'NOTA_CREDITO' && inv.id !== initialData?.id
    )

    // Las retenciones ahora se obtienen de:
    // 1. Extracción IA del documento (si tiene retenciones impresas)
    // 2. Sugerencia IA según normas Colombia (si no tiene retenciones)
    // 3. Entrada manual del usuario
    // Ya no se auto-calculan desde % del proveedor

    const handleAIExtract = async (file: File) => {
        setAnalyzing(true)
        setAnalyzing(true)
        setError(null)
        setValidationWarning(null)
        setExtractedProvider(null)
        try {
            const analysis = await analyzeDocument(file, unitId)
            if (analysis.confidence) setAiConfidence(analysis.confidence)
            if (analysis.type === 'INVOICE' && analysis.data) {
                const data = analysis.data
                setForm(f => ({
                    ...f,
                    invoiceNumber: data.invoiceNumber || f.invoiceNumber,
                    invoiceDate: data.date || f.invoiceDate,
                    subtotal: data.totalAmount || f.subtotal,
                    totalAmount: data.totalAmount || f.totalAmount,
                    description: data.concept || f.description
                }))

                if (data.nit) {
                    const cleanNit = data.nit.replace(/[^0-9]/g, '')
                    const matchedProvider = providers.find((p: any) => p.nit.replace(/[^0-9]/g, '') === cleanNit)
                    if (matchedProvider) {
                        setForm(f => ({ ...f, providerId: matchedProvider.id }))
                    } else {
                        setExtractedProvider({ name: data.providerName || 'Proveedor Nuevo', nit: data.nit })
                        setError(`AI extrajo el NIT ${data.nit} (${data.providerName}), pero no coincide con ningún proveedor registrado.`)
                    }
                }

                // Validate Receiver logic
                if (data.clientNit && selectedUnit?.taxId) {
                    const cleanClientNit = data.clientNit.replace(/[^0-9]/g, '')
                    const cleanUnitNit = selectedUnit.taxId.replace(/[^0-9]/g, '')

                    // Allow some flexibility (substring match usually safe enough to avoid false positives on '800.123.456' vs '800123456-1')
                    if (cleanClientNit && cleanUnitNit && !cleanUnitNit.includes(cleanClientNit) && !cleanClientNit.includes(cleanUnitNit)) {
                        setValidationWarning(`⚠️ Advertencia: Esta factura parece ser para el NIT ${data.clientNit}, pero el conjunto actual es ${selectedUnit.taxId} (${selectedUnit.name}). Verifique antes de guardar.`)
                    }
                }

                if (data.retentions) {
                    if (data.retentions?.retefuente?.amount && data.retentions.retefuente.amount > 0) {
                        setForm(f => ({ ...f, retefuenteAmount: data.retentions!.retefuente!.amount }))
                    }
                    if (data.retentions?.reteica?.amount && data.retentions.reteica.amount > 0) {
                        setForm(f => ({ ...f, reteicaAmount: data.retentions!.reteica!.amount }))
                    }
                }
            } else if (analysis.type === 'PAYMENT_RECEIPT') {
                setError('Este documento parece ser un comprobante de pago, no una factura. Por favor súbelo en la sección de Egresos.')
            } else {
                setError('No se pudo extraer información válida de este documento con IA.')
            }
        } catch (err) {
            console.error('AI Extraction error:', err)
            setError('Error al conectar con el servicio de IA.')
        } finally {
            setAnalyzing(false)
        }
    }

    const handleQuickCreateProvider = async () => {
        if (!extractedProvider) return
        setCreatingProvider(true)
        setError(null)
        try {
            const newProvider = await createProvider({
                name: extractedProvider.name,
                nit: extractedProvider.nit,
                taxType: 'NIT',
                dv: '0',
                status: 'ACTIVE'
            })

            if (newProvider && newProvider.id) {
                await queryClient.invalidateQueries({ queryKey: ['providers'] })
                setForm(f => ({ ...f, providerId: newProvider.id }))
                setExtractedProvider(null)
                setError(null)
            }
        } catch (err: any) {
            console.error('Error creating provider:', err)
            setError(err.message || 'Error al crear el proveedor')
        } finally {
            setCreatingProvider(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setUploading(true)
        setError(null)
        try {
            // File URL is already handled by SmartFileUploader
            // if (file) { ... }

            const invoiceData = {
                ...form,
                fileUrl: fileUrl || initialData?.fileUrl,
                isAutogenerated: isCuentaDeCobro,
                // Sanitize empty strings to undefined for optional backend fields
                relatedInvoiceId: form.relatedInvoiceId || undefined,
                adjustmentReason: form.adjustmentReason || undefined,
                dueDate: form.dueDate || undefined,
                // Ensure numeric values are numbers
                subtotal: Number(form.subtotal),
                taxIva: Number(form.taxIva),
                retefuenteAmount: Number(form.retefuenteAmount),
                reteicaAmount: Number(form.reteicaAmount),
                totalAmount: Number(form.totalAmount)
            }

            if (isEditMode) {
                await updateInvoice(initialData.id, invoiceData)
            } else {
                const response = await fetch(`${API_BASE}/invoices`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...invoiceData, unitId })
                })

                if (!response.ok) {
                    let data;
                    try {
                        const text = await response.text()
                        data = JSON.parse(text)
                    } catch (e) { }

                    if (data && data.error === 'DUPLICATE_INVOICE') {
                        setError(data.message)
                        setUploading(false)
                        return
                    }
                    throw new Error((data && (data.error || data.message)) || `Error del servidor (${response.status})`)
                }
            }
            onSuccess()
        } catch (err: any) {
            console.error('Error saving invoice:', err)
            setError(err.message || 'Error al guardar factura')
            setUploading(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <AIProcessingOverlay
                visible={analyzing}
                message="Analizando documento..."
                subMessage="Extrayendo información clave con IA"
            />
            <div className="bg-white rounded-card shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh] overflow-hidden animate-scale-in">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-white">
                    <h2 className="text-lg font-bold text-gray-900">
                        {isEditMode ? 'Editar Factura' : 'Registrar Factura'}
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body (Scrollable) */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    <form id="invoice-form" onSubmit={handleSubmit} className="space-y-4">
                        {/* Validation Warning */}
                        {validationWarning && (
                            <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-card text-sm flex items-start gap-2 animate-fade-in">
                                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-bold">Posible error de destinatario</p>
                                    <p>{validationWarning}</p>
                                </div>
                            </div>
                        )}

                        {/* Error display */}
                        {error && (
                            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-card text-sm flex flex-col gap-2 animate-shake">
                                <span>{error}</span>
                                {extractedProvider && (
                                    <button
                                        type="button"
                                        onClick={handleQuickCreateProvider}
                                        disabled={creatingProvider}
                                        className="w-fit px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-1"
                                    >
                                        {creatingProvider ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                                        Registrar "{extractedProvider.name}" como nuevo proveedor
                                    </button>
                                )}
                            </div>
                        )}

                        {/* AI Confidence Indicator */}
                        {aiConfidence !== null && !error && (
                            <div className="flex justify-end -mt-2">
                                <AIConfidenceIndicator score={Math.round(aiConfidence * 100)} size="sm" />
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor *</label>
                            <select
                                className="w-full px-3 py-2 border border-gray-200 rounded-input text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
                                value={form.providerId}
                                onChange={(e) => setForm(f => ({ ...f, providerId: e.target.value }))}
                                required
                            >
                                <option value="">Seleccione un proveedor...</option>
                                {providers.map((p: Provider) => (
                                    <option key={p.id} value={p.id}>
                                        {p.name} ({p.nit}{p.dv ? `-${p.dv}` : ''})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Document Type Selector */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Documento *</label>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => handleDocumentTypeChange('FACTURA')}
                                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border-2 transition-all ${form.documentType === 'FACTURA'
                                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                                        }`}
                                >
                                    📄 Factura
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleDocumentTypeChange('NOTA_CREDITO')}
                                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border-2 transition-all ${form.documentType === 'NOTA_CREDITO'
                                        ? 'border-red-500 bg-red-50 text-red-700'
                                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                                        }`}
                                >
                                    📋 Nota Crédito
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleDocumentTypeChange('CUENTA_COBRO')}
                                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border-2 transition-all ${form.documentType === 'CUENTA_COBRO'
                                        ? 'border-amber-500 bg-amber-50 text-amber-700'
                                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                                        }`}
                                >
                                    📝 Cuenta Cobro
                                </button>
                            </div>
                        </div>

                        {/* Credit Note Fields */}
                        {isNotaCredito && (
                            <div className="space-y-3 p-3 bg-red-50 border border-red-100 rounded-lg animate-fade-in">
                                <div>
                                    <label className="block text-sm font-medium text-red-700 mb-1">Factura que modifica *</label>
                                    <select
                                        className="w-full px-3 py-2 border border-red-200 rounded-input text-sm focus:ring-2 focus:ring-red-500 outline-none bg-white"
                                        value={form.relatedInvoiceId}
                                        onChange={(e) => setForm(f => ({ ...f, relatedInvoiceId: e.target.value }))}
                                        required={isNotaCredito}
                                    >
                                        <option value="">Seleccione la factura original...</option>
                                        {providerInvoices.map((inv: any) => (
                                            <option key={inv.id} value={inv.id}>
                                                {inv.invoiceNumber} - ${inv.totalAmount?.toLocaleString()} ({inv.status})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-red-700 mb-1">Motivo del ajuste *</label>
                                    <select
                                        className="w-full px-3 py-2 border border-red-200 rounded-input text-sm focus:ring-2 focus:ring-red-500 outline-none bg-white"
                                        value={form.adjustmentReason}
                                        onChange={(e) => setForm(f => ({ ...f, adjustmentReason: e.target.value }))}
                                        required={isNotaCredito}
                                    >
                                        <option value="">Seleccione motivo...</option>
                                        <option value="DEVOLUCION">Devolución de mercancía</option>
                                        <option value="DESCUENTO">Descuento posterior</option>
                                        <option value="ERROR">Corrección de error</option>
                                        <option value="OTRO">Otro</option>
                                    </select>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {isCuentaDeCobro ? '# Cuenta de Cobro' : '# Factura'} *
                                </label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={form.invoiceNumber}
                                        onChange={(e) => setForm(f => ({ ...f, invoiceNumber: e.target.value }))}
                                        placeholder={isCuentaDeCobro ? 'Auto-generado...' : 'FV-2024-001'}
                                        className={`w-full px-3 py-2 border border-gray-200 rounded-input text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all ${isCuentaDeCobro ? 'bg-gray-50 text-gray-500 select-none' : ''}`}
                                        disabled={isCuentaDeCobro}
                                        required
                                    />
                                    {loadingCCNumber && (
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Factura *</label>
                                <input
                                    type="date"
                                    value={form.invoiceDate}
                                    onChange={(e) => setForm(f => ({ ...f, invoiceDate: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-input text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Vencimiento</label>
                            <input
                                type="date"
                                value={form.dueDate}
                                onChange={(e) => setForm(f => ({ ...f, dueDate: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-200 rounded-input text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Subtotal (Base) *</label>
                                <input
                                    type="number"
                                    required
                                    value={form.subtotal || ''}
                                    onChange={(e) => setForm(f => ({ ...f, subtotal: Number(e.target.value) || 0 }))}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-input text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">IVA</label>
                                <input
                                    type="number"
                                    value={form.taxIva || ''}
                                    onChange={(e) => setForm(f => ({ ...f, taxIva: Number(e.target.value) || 0 }))}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-input text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                                />
                            </div>
                        </div>

                        {/* Tax Retention Section */}
                        <div className="bg-brand-50/30 p-4 rounded-card border border-brand-100">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-brand-800 mb-1">Retefuente</label>
                                    <input
                                        type="number"
                                        value={form.retefuenteAmount || ''}
                                        onChange={(e) => setForm(f => ({ ...f, retefuenteAmount: Number(e.target.value) || 0 }))}
                                        className="w-full px-3 py-1.5 border border-brand-200 rounded-input bg-white focus:ring-2 focus:ring-brand-500 text-sm outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-brand-800 mb-1">ReteICA</label>
                                    <input
                                        type="number"
                                        value={form.reteicaAmount || ''}
                                        onChange={(e) => setForm(f => ({ ...f, reteicaAmount: Number(e.target.value) || 0 }))}
                                        className="w-full px-3 py-1.5 border border-brand-200 rounded-input bg-white focus:ring-2 focus:ring-brand-500 text-sm outline-none"
                                    />
                                </div>
                            </div>
                            <div className="mt-3 pt-3 border-t border-brand-100 flex justify-between items-center">
                                <span className="text-xs font-bold text-brand-900 uppercase tracking-tight">Neto a Pagar:</span>
                                <span className="text-xl font-black text-brand-700">
                                    {formatMoney(Number(form.subtotal) + Number(form.taxIva) - Number(form.retefuenteAmount) - Number(form.reteicaAmount))}
                                </span>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Total Facturado (con IVA)</label>
                            <input
                                type="number"
                                required
                                value={form.totalAmount || ''}
                                onChange={(e) => setForm(f => ({ ...f, totalAmount: Number(e.target.value) || 0 }))}
                                className="w-full px-3 py-2 border border-gray-200 rounded-input text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none font-bold text-brand-700"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Descripción / Concepto</label>
                            <textarea
                                value={form.description}
                                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                                placeholder="Escribe el concepto de esta factura..."
                                rows={2}
                                className="w-full px-3 py-2 border border-gray-200 rounded-input text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none resize-none"
                            />
                        </div>

                        {/* File Upload Section */}
                        {/* File Upload Section */}
                        <div className="space-y-2">
                            <SmartFileUploader
                                folder={`units/${unitId}/invoices`}
                                onUploadComplete={(url, uploadedFile) => {
                                    setFileUrl(url)
                                    setFile(uploadedFile)
                                    setError(null)
                                }}
                                currentFileUrl={fileUrl}
                                onRemove={() => {
                                    setFileUrl(null)
                                    setFile(null)
                                }}
                            />

                            {file && (
                                <AIButton
                                    variant="primary"
                                    size="sm"
                                    loading={analyzing}
                                    onClick={() => handleAIExtract(file)}
                                    className="w-full shadow-brand-100"
                                >
                                    {analyzing ? 'Procesando con IA...' : 'Auto-completar con IA ✨'}
                                </AIButton>
                            )}
                        </div>
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
                        form="invoice-form"
                        type="submit"
                        disabled={uploading || !form.providerId || !form.invoiceNumber || !form.subtotal}
                        className="px-8 py-2.5 bg-brand-primary hover:bg-brand-700 text-white text-sm font-bold rounded-button shadow-lg shadow-brand-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2"
                    >
                        {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
                        {uploading ? 'Guardando...' : (isEditMode ? 'Actualizar Factura' : 'Registrar Factura')}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default function InvoicesPage() {
    const { selectedUnit } = useUnit()
    const [searchParams] = useSearchParams()
    const queryClient = useQueryClient()
    const unitId = selectedUnit?.id || ''

    const [search, setSearch] = useState(searchParams.get('search') || '')
    const [showModal, setShowModal] = useState(false)
    const [showPreviewModal, setShowPreviewModal] = useState(false)
    const [uploadInvoiceId, setUploadInvoiceId] = useState<string | null>(null)
    const [uploadingFile, setUploadingFile] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<Invoice & { provider?: { name: string } } | null>(null)
    // const [scanningGmail, setScanningGmail] = useState(false)
    const [editingInvoice, setEditingInvoice] = useState<(Invoice & { provider?: { name: string } }) | null>(null)

    // Data fetching
    const { data: invoicesData, isLoading } = useQuery({
        queryKey: ['invoices', unitId],
        queryFn: () => getInvoices({ unitId }),
        enabled: !!unitId
    })

    const { data: statsData } = useQuery({
        queryKey: ['invoice-stats', unitId],
        queryFn: () => getInvoiceStats(unitId),
        enabled: !!unitId
    })

    const { data: gmailStatus } = useQuery({
        queryKey: ['gmail-status', unitId],
        queryFn: () => unitId ? getGmailStatus(unitId) : Promise.resolve(null),
        enabled: !!unitId,
        refetchInterval: 5000 // Poll every 5s
    })

    const invoices = invoicesData?.invoices || []

    // Stats with default values to avoid crashes
    const stats = statsData || {
        pending: { total: 0, count: 0 },
        partiallyPaid: { total: 0, count: 0 },
        paid: { total: 0, count: 0 }
    }

    // Filter logic
    const filtered = useMemo(() => {
        if (!search) return invoices;
        const lowerSearch = search.toLowerCase();
        return invoices.filter((inv: any) =>
            inv.invoiceNumber.toLowerCase().includes(lowerSearch) ||
            inv.provider?.name.toLowerCase().includes(lowerSearch) ||
            inv.description?.toLowerCase().includes(lowerSearch) ||
            statusLabels[inv.status]?.toLowerCase().includes(lowerSearch)
        )
    }, [invoices, search])

    const handleDeleteInvoice = (invoice: Invoice & { provider?: { name: string } }) => {
        setShowDeleteConfirm(invoice)
    }

    const confirmDelete = async () => {
        if (!showDeleteConfirm) return
        setDeletingId(showDeleteConfirm.id)
        try {
            await deleteInvoice(showDeleteConfirm.id)
            queryClient.invalidateQueries({ queryKey: ['invoices'] })
            queryClient.invalidateQueries({ queryKey: ['invoice-stats'] })
            setShowDeleteConfirm(null)
        } catch (error) {
            console.error('Error deleting invoice:', error)
            alert(error instanceof Error ? error.message : 'Error al eliminar la factura. Por favor intente de nuevo.')
        } finally {
            setDeletingId(null)
        }
    }

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !uploadInvoiceId) return

        setUploadingFile(true)
        try {
            const res = await uploadFileToStorage(file, `units/${unitId}/invoices`)
            await updateInvoice(uploadInvoiceId, { fileUrl: res.url })
            queryClient.invalidateQueries({ queryKey: ['invoices'] })
            alert('Factura cargada exitosamente')
        } catch (error) {
            console.error('Error uploading file:', error)
            alert('Error al cargar la factura')
        } finally {
            setUploadingFile(false)
            setUploadInvoiceId(null)
            // Reset input
            e.target.value = ''
        }
    }

    // Use global AI context for scanning
    const { scanState, minimizeScanUI, maximizeScanUI, dismissScanUI } = useAI()

    // Derived state for local UI
    const isScanning = scanState.status === 'PROCESSING' || scanState.status === 'PENDING';
    const showOverlay = isScanning && !scanState.minimized;

    // Watch for progress to refresh table in REAL TIME
    const [lastProcessedCount, setLastProcessedCount] = useState(0);

    useEffect(() => {
        // If items increased, refresh table
        if (scanState.processedEmails > lastProcessedCount) {
            queryClient.invalidateQueries({ queryKey: ['invoices'] })
            setLastProcessedCount(scanState.processedEmails)
        }

        // Reset when starting new
        if (scanState.status === 'PENDING') {
            setLastProcessedCount(0)
        }

        // Final refresh on completion
        if (scanState.status === 'COMPLETED') {
            queryClient.invalidateQueries({ queryKey: ['invoices'] })
            queryClient.invalidateQueries({ queryKey: ['invoice-stats'] })
            queryClient.invalidateQueries({ queryKey: ['units'] })
        }
    }, [scanState.status, scanState.processedEmails, lastProcessedCount, queryClient])




    const handleApproveInvoice = async (id: string) => {
        try {
            await updateInvoice(id, { status: 'PENDING' })
            queryClient.invalidateQueries({ queryKey: ['invoices'] })
            queryClient.invalidateQueries({ queryKey: ['invoice-stats'] })
        } catch (error) {
            console.error('Error approving invoice:', error)
            alert('Error al aprobar la factura.')
        }
    }

    if (!unitId) {
        return <div className="p-8 text-center text-gray-500">Selecciona una copropiedad para continuar.</div>
    }

    // Feedback State
    const [showFeedbackModal, setShowFeedbackModal] = useState(false)
    const [feedbackItem, setFeedbackItem] = useState<any>(null)


    return (
        <>
            {/* AI Processing Overlay for Gmail Scan */}
            <AIProcessingOverlay
                visible={showOverlay}
                message={scanState.message || 'Iniciando escaneo...'}
                subMessage="Esto puede tomar unos minutos dependiendo de la cantidad de correos."
                progress={scanState.progress > 0 ? scanState.progress : undefined}
                estimatedTime={undefined}
                onMinimize={minimizeScanUI}
            />



            <div className="space-y-6 animate-fade-in">
                {/* Header */}

                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Facturas (CxP)</h1>
                        <p className="text-sm text-gray-500 mt-1">Causación y control de deuda</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {gmailStatus?.connected ? (
                            <div className="flex flex-col items-end gap-0.5 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs border border-green-200">
                                <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                    <span className="font-medium line-clamp-1">{gmailStatus.email}</span>
                                </div>
                                <span className="text-[10px] text-green-600/80">Scan: {formatRelativeTime(selectedUnit?.gmailLastAutoScan)}</span>
                            </div>
                        ) : (
                            <button
                                onClick={() => connectGmail(unitId)}
                                className="px-3 py-2 border border-blue-200 text-blue-700 bg-blue-50 rounded-lg text-sm font-medium hover:bg-blue-100 flex items-center gap-2"
                                title="Conectar cuenta de Gmail para escanear facturas"
                            >
                                <Mail className="w-4 h-4" />
                                Conectar Gmail
                            </button>
                        )}

                        <Link
                            to="/"
                            className="px-3 py-2 border border-indigo-200 text-indigo-700 bg-indigo-50 rounded-lg text-sm font-medium hover:bg-indigo-100 flex items-center gap-2"
                            title="Escanea facturas desde el panel principal"
                        >
                            <Sparkles className="w-4 h-4" />
                            Escanear Inbox →
                        </Link>

                        {/* AI Scan Config moved to global or per-unit settings */}

                        <button
                            onClick={() => {
                                const dataToExport = filtered.map((inv: any) => ({
                                    invoiceNumber: inv.invoiceNumber,
                                    provider: inv.provider?.name || '',
                                    invoiceDate: inv.invoiceDate,
                                    dueDate: inv.dueDate,
                                    description: inv.description,
                                    baseAmount: Number(inv.subtotal),
                                    ivaAmount: Number(inv.taxIva),
                                    totalAmount: Number(inv.totalAmount),
                                    status: statusLabels[inv.status] || inv.status
                                }))
                                exportToExcel(dataToExport, [
                                    { key: 'invoiceNumber', header: '# Factura' },
                                    { key: 'provider', header: 'Proveedor' },
                                    { key: 'invoiceDate', header: 'Fecha', format: 'date' },
                                    { key: 'dueDate', header: 'Vencimiento', format: 'date' },
                                    { key: 'description', header: 'Descripción' },
                                    { key: 'baseAmount', header: 'Base', format: 'money' },
                                    { key: 'ivaAmount', header: 'IVA', format: 'money' },
                                    { key: 'totalAmount', header: 'Total', format: 'money' },
                                    { key: 'status', header: 'Estado' }
                                ], `facturas_${new Date().toISOString().split('T')[0]}`)
                            }}
                            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center gap-2"
                        >
                            <Download className="w-4 h-4" />
                            Exportar
                        </button>
                        <button
                            onClick={() => setShowModal(true)}
                            className="px-4 py-2 bg-brand-primary text-white rounded-button text-sm font-medium hover:bg-brand-700 shadow-sm flex items-center gap-2"
                        >
                            <Plus className="w-4 h-4" />
                            Registrar Factura
                        </button>
                    </div>
                </div>

                {/* DRAFT ATTENTION ALERT */}
                {invoices.some((inv: any) => inv.status === 'DRAFT') && (
                    <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex items-center justify-between shadow-sm animate-pulse">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-100 rounded-lg text-purple-700">
                                <Sparkles className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-purple-900">Facturas en Borrador</p>
                                <p className="text-xs text-purple-700">Tienes facturas importadas por IA que requieren tu revisión y aprobación.</p>
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

                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="card p-4 border-l-4 border-l-amber-500">
                        <p className="text-sm text-gray-500">Total Pendiente</p>
                        <p className="text-xl font-bold text-gray-900 mt-1">{formatMoney(stats.pending.total)}</p>
                        <p className="text-xs text-amber-600 mt-1">{stats.pending.count} facturas</p>
                    </div>
                    <div className="card p-4 border-l-4 border-l-indigo-500">
                        <p className="text-sm text-gray-500">Pago Parcial</p>
                        <p className="text-xl font-bold text-gray-900 mt-1">{formatMoney(stats.partiallyPaid.total)}</p>
                        <p className="text-xs text-indigo-600 mt-1">{stats.partiallyPaid.count} facturas</p>
                    </div>
                    <div className="card p-4 border-l-4 border-l-emerald-500">
                        <p className="text-sm text-gray-500">Pagadas (Mes)</p>
                        <p className="text-xl font-bold text-gray-900 mt-1">{formatMoney(stats.paid.total)}</p>
                        <p className="text-xs text-emerald-600 mt-1">{stats.paid.count} facturas</p>
                    </div>
                </div>

                {/* Filters */}
                <div className="card p-4">
                    <div className="flex items-center gap-4">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar factura o proveedor..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                            />
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="card overflow-x-auto">
                    {isLoading ? (
                        <div className="p-8 text-center text-gray-500">Cargando facturas...</div>
                    ) : invoices.length === 0 ? (
                        <div className="p-8 text-center">
                            <p className="text-gray-500">No hay facturas registradas</p>
                            <button onClick={() => setShowModal(true)} className="mt-4 text-indigo-600 hover:text-indigo-700 font-medium text-sm">
                                + Registrar primera factura
                            </button>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead className="bg-gray-50 border-b border-gray-100">
                                <tr>
                                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3"># Factura</th>
                                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Proveedor</th>
                                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Fecha</th>
                                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Vencimiento</th>
                                    <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Total</th>
                                    <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Saldo</th>
                                    <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Soporte</th>
                                    <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Estado</th>
                                    <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filtered.map((inv: Invoice & { provider?: { name: string }; balance?: number; fileUrl?: string }) => (
                                    <tr key={inv.id} className="hover:bg-gray-50/50">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-sm font-medium text-indigo-600">{inv.invoiceNumber}</span>
                                                {inv.documentType === 'NOTA_CREDITO' && (
                                                    <span className="text-[10px] bg-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded border border-red-200">NC</span>
                                                )}
                                                {inv.documentType === 'CUENTA_COBRO' && (
                                                    <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded border border-amber-200">CC</span>
                                                )}
                                            </div>
                                            {inv.source === 'GMAIL' && (
                                                <div className="flex items-center gap-1 mt-1">
                                                    <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100 flex items-center gap-1">
                                                        <Mail className="w-3 h-3" /> Gmail
                                                    </span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="font-medium text-gray-900">{inv.provider?.name || 'N/A'}</p>
                                            {inv.source === 'GMAIL' && inv.emailSubject && (
                                                <p
                                                    className="text-xs text-gray-500 mt-0.5 truncate max-w-[200px] cursor-pointer hover:text-blue-600 hover:bg-blue-50 rounded px-1 -ml-1 transition-colors flex items-center gap-1 group"
                                                    title="Clic para copiar asunto"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        navigator.clipboard.writeText(inv.emailSubject || '');
                                                        // Optional: could add a toast here, for now simple browser implementation
                                                        const el = e.currentTarget;
                                                        const originalText = el.innerHTML;
                                                        el.innerHTML = '<span class="font-medium text-emerald-600">¡Copiado!</span>';
                                                        setTimeout(() => {
                                                            el.innerHTML = originalText;
                                                        }, 1000);
                                                    }}
                                                >
                                                    <span className="font-medium text-blue-600 group-hover:underline">Asunto:</span> {inv.emailSubject}
                                                </p>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-600">{new Date(inv.invoiceDate).toLocaleDateString('es-CO')}</td>
                                        <td className="px-4 py-3 text-sm text-gray-600">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('es-CO') : '-'}</td>
                                        <td className="px-4 py-3 text-right font-medium text-gray-900">{formatMoney(Number(inv.totalAmount))}</td>
                                        <td className="px-4 py-3 text-right font-semibold text-amber-600">{formatMoney(inv.balance ?? Number(inv.totalAmount))}</td>
                                        <td className="px-4 py-3 text-center">
                                            <div className="flex items-center justify-center gap-1">
                                                {inv.fileUrl && (
                                                    <button
                                                        onClick={async (e) => {
                                                            e.stopPropagation()
                                                            try {
                                                                const url = inv.fileUrl!

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

                                                                if (!isImage && (url.includes('/raw/upload/') || url.endsWith('.pdf_secure') || !url.toLowerCase().endsWith('.pdf'))) {

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
                                                        className="inline-flex items-center justify-center p-1 text-indigo-600 hover:bg-indigo-50 rounded"
                                                        title="Ver Factura"
                                                    >
                                                        <FileText className="w-4 h-4" />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        console.log('Upload button clicked for invoice:', inv.id)
                                                        setUploadInvoiceId(inv.id)
                                                        const input = document.getElementById('invoice-upload-input') as HTMLInputElement
                                                        if (input) {
                                                            input.click()
                                                        } else {
                                                            alert('Error: No se encontró el campo de carga.')
                                                        }
                                                    }}
                                                    className={`p-1 rounded disabled:opacity-50 ${inv.fileUrl ? 'text-gray-400 hover:bg-gray-100' : 'text-amber-600 hover:bg-amber-50'}`}
                                                    disabled={uploadingFile && uploadInvoiceId === inv.id}
                                                    title={inv.fileUrl ? "Reemplazar Factura" : "Cargar Factura Original"}
                                                >
                                                    {uploadingFile && uploadInvoiceId === inv.id ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        <Upload className="w-4 h-4" />
                                                    )}
                                                </button>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <div className="flex items-center justify-center gap-1">
                                                <span className={`status-pill ${statusStyles[inv.status]}`}>
                                                    {statusLabels[inv.status]}
                                                </span>
                                                {inv.monthlyReportId && (
                                                    <span title="Incluido en Cierre Contable">
                                                        <CheckCircle2 className="w-4 h-4 text-blue-600" />
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                {inv.status === 'DRAFT' && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            handleApproveInvoice(inv.id)
                                                        }}
                                                        className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                                        title="Aprobar Borrador"
                                                    >
                                                        <Check className="w-4 h-4" />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        setEditingInvoice(inv)
                                                        setShowModal(true)
                                                    }}
                                                    disabled={!!inv.monthlyReportId}
                                                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                                    title={inv.monthlyReportId ? 'No se puede editar (incluido en cierre)' : 'Editar factura'}
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        setFeedbackItem({ id: inv.id, type: 'INVOICE' })
                                                        setShowFeedbackModal(true)
                                                    }}
                                                    className="p-1.5 text-gray-500 hover:bg-gray-100 hover:text-indigo-600 rounded-lg transition-colors"
                                                    title="Comentar / Reportar error IA"
                                                >
                                                    <MessageSquare className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        handleDeleteInvoice(inv)
                                                    }}
                                                    disabled={deletingId === inv.id || !!inv.monthlyReportId}
                                                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                                    title={inv.monthlyReportId ? 'No se puede eliminar (incluido en cierre)' : 'Eliminar factura'}
                                                >
                                                    {deletingId === inv.id ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        <Trash2 className="w-4 h-4" />
                                                    )}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            <input
                type="file"
                id="invoice-upload-input"
                className="hidden"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={handleFileUpload}
            />

            {/* Modal */}
            {
                showModal && (
                    <InvoiceModal
                        unitId={unitId}
                        initialData={editingInvoice}
                        onClose={() => {
                            setShowModal(false)
                            setEditingInvoice(null)
                        }}
                        onSuccess={() => {
                            setShowModal(false)
                            setEditingInvoice(null)
                            queryClient.invalidateQueries({ queryKey: ['invoices'] })
                            queryClient.invalidateQueries({ queryKey: ['invoice-stats'] })
                        }}
                    />
                )
            }

            {/* Gmail Preview Modal */}
            {
                showPreviewModal && (
                    <GmailPreviewModal
                        unitId={unitId}
                        onClose={() => setShowPreviewModal(false)}
                    />
                )
            }

            {/* Delete Confirmation Modal */}
            {
                showDeleteConfirm && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
                            <div className="p-6 text-center">
                                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                                    <AlertTriangle className="h-6 w-6 text-red-600" />
                                </div>
                                <h3 className="text-lg font-medium text-gray-900 mb-2">¿Eliminar Factura?</h3>
                                <p className="text-sm text-gray-500 mb-6">
                                    Estás a punto de eliminar la factura <span className="font-mono font-medium text-gray-900">{showDeleteConfirm.invoiceNumber}</span> de <span className="font-medium text-gray-900">{showDeleteConfirm.provider?.name}</span> por valor de <span className="font-medium text-gray-900">{formatMoney(Number(showDeleteConfirm.totalAmount))}</span>.
                                    <br /><br />
                                    Esta acción no se puede deshacer.
                                </p>
                                <div className="flex justify-center gap-3">
                                    <button
                                        onClick={() => setShowDeleteConfirm(null)}
                                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                                        disabled={deletingId === showDeleteConfirm.id}
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={confirmDelete}
                                        className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                                        disabled={deletingId === showDeleteConfirm.id}
                                    >
                                        {deletingId === showDeleteConfirm.id && <Loader2 className="w-4 h-4 animate-spin" />}
                                        {deletingId === showDeleteConfirm.id ? 'Eliminando...' : 'Sí, eliminar'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Minimized Progress Widget */}
            {isScanning && scanState.minimized && (
                <div className="fixed bottom-6 right-6 bg-white rounded-xl shadow-2xl border border-gray-100 p-4 w-80 animate-slide-up z-50 cursor-pointer hover:shadow-xl transition-shadow ring-1 ring-gray-900/5 group"
                    onClick={maximizeScanUI}
                >
                    <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-3">
                            <div className="relative p-2 bg-indigo-50 rounded-lg group-hover:bg-indigo-100 transition-colors">
                                <Mail className="w-5 h-5 text-indigo-600" />
                                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500 border-2 border-white"></span>
                                </span>
                            </div>
                            <div>
                                <h4 className="font-semibold text-sm text-gray-900 leading-tight">
                                    Escanenado Gmail
                                </h4>
                                <p className="text-xs text-gray-500 mt-0.5">Segundo plano</p>
                            </div>
                        </div>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (confirm('¿Detener monitoreo visual? El proceso seguirá en el servidor.')) {
                                    dismissScanUI();
                                }
                            }}
                            className="text-gray-400 hover:text-red-600 hover:bg-gray-100 p-1 rounded transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between text-xs font-medium text-gray-600">
                            <span className="truncate max-w-[180px]">{scanState.message}</span>
                            <span>{Math.round(scanState.progress)}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-indigo-600 rounded-full transition-all duration-500 ease-out"
                                style={{ width: `${scanState.progress}%` }}
                            />
                        </div>
                        <p className="text-[10px] text-gray-400 text-center pt-1">Clic para expandir</p>
                    </div>
                </div>
            )}
            {showFeedbackModal && feedbackItem && (
                <FeedbackModal
                    isOpen={showFeedbackModal}
                    onClose={() => setShowFeedbackModal(false)}
                    unitId={unitId}
                    documentType="INVOICE"
                    referenceId={feedbackItem.id}
                />
            )}
        </>
    )
}

