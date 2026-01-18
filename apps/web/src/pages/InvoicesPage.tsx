import { Plus, Search, X, FileText, Upload, Loader2, Download, Trash2, Pencil, ChevronDown, Check, AlertTriangle, CheckCircle2, Mail, Sparkles, Eye, Brain, Send } from 'lucide-react'
import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getInvoices, getProviders, getInvoiceStats, updateInvoice, getNextCCNumber, deleteInvoice, scanGmail, connectGmail, getGmailStatus, getGmailPreview, analyzeDocument, createProvider, API_BASE, getScanStatus, sendAIFeedback } from '../lib/api/index'

import { uploadFileToStorage } from '../lib/storage'
import { exportToExcel } from '../lib/exportExcel'
import { useUnit } from '../lib/UnitContext'
import { useAI } from '../lib/AIContext'
import { AIButton, AIProcessingOverlay, AIConfidenceIndicator } from '../components/ui'

import type { Invoice, Provider } from '../lib/api/index'

// Helper for formatting money
const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount)
}

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
    })

    const [file, setFile] = useState<File | null>(null)
    const [uploading, setUploading] = useState(false)
    const [isCuentaDeCobro, setIsCuentaDeCobro] = useState(initialData?.isAutogenerated || false)
    const [loadingCCNumber, setLoadingCCNumber] = useState(false)
    const [error, setError] = useState<string | null>(null)
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

    // Fetch next CC number when checkbox is checked
    const handleCuentaDeCobroChange = async (checked: boolean) => {
        setIsCuentaDeCobro(checked)
        setError(null)

        if (checked) {
            setLoadingCCNumber(true)
            try {
                const result = await getNextCCNumber(unitId)
                setForm(f => ({ ...f, invoiceNumber: result.number }))
            } catch (err) {
                console.error('Error fetching CC number:', err)
                setError('Error al generar número de cuenta de cobro')
            } finally {
                setLoadingCCNumber(false)
            }
        } else {
            setForm(f => ({ ...f, invoiceNumber: '' }))
        }
    }

    // Auto-calculate taxes when subtotal or provider changes
    useEffect(() => {
        if (!form.providerId || form.subtotal <= 0) {
            // Reset retentions if provider or subtotal is not set
            setForm(f => ({
                ...f,
                retefuenteAmount: 0,
                reteicaAmount: 0
            }))
            return
        }

        const provider = providers.find((p: any) => p.id === form.providerId)
        if (provider) {
            const retefuentePerc = Number(provider.defaultRetefuentePerc) || 0
            const reteicaPerc = Number(provider.defaultReteicaPerc) || 0 // Assuming this is stored as a percentage (e.g., 0.966 for 9.66 per 1000)

            const calcRetefuente = Math.round(form.subtotal * (retefuentePerc / 100))
            // If reteicaPerc is stored as a percentage (e.g., 0.966 for 9.66 per 1000), then divide by 100
            // If it's stored as a nominal value (e.g., 9.66 for 9.66 per 1000), then divide by 1000
            // Let's assume it's a percentage like retefuente, so divide by 100.
            // If it's per 1000, the DB should store it as 0.00966 or the UI should convert 9.66 to 0.00966.
            // For now, assuming it's a percentage like retefuente.
            const calcReteica = Math.round(form.subtotal * (reteicaPerc / 100))

            setForm(f => ({
                ...f,
                retefuenteAmount: calcRetefuente,
                reteicaAmount: calcReteica
            }))
        }
    }, [form.providerId, form.subtotal, providers]) // Added providers to dependency array

    const handleAIExtract = async (file: File) => {
        setAnalyzing(true)
        setError(null)
        setExtractedProvider(null)
        try {
            const analysis = await analyzeDocument(file)
            if (analysis.confidence) setAiConfidence(analysis.confidence)
            if (analysis.type === 'INVOICE' && analysis.data) {
                const data = analysis.data
                setForm(f => ({
                    ...f,
                    invoiceNumber: data.invoiceNumber || f.invoiceNumber,
                    invoiceDate: data.date || f.invoiceDate,
                    subtotal: data.totalAmount || f.subtotal, // Default subtotal to totalAmount if not differentiated
                    totalAmount: data.totalAmount || f.totalAmount,
                    description: data.concept || f.description
                }))

                // Try to match provider by NIT
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
                // Invalidate providers query to refresh the list
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

        let fileUrl = ''

        try {
            if (file) {
                const res = await uploadFileToStorage(file, `units/${unitId}/invoices`)
                fileUrl = res.url
            }

            const invoiceData = {
                ...form,
                fileUrl: fileUrl || initialData?.fileUrl,
                isAutogenerated: isCuentaDeCobro,
                // totalAmount is now directly from form state
            }

            if (isEditMode) {
                await updateInvoice(initialData.id, invoiceData)
            } else {
                const response = await fetch(`${API_BASE}/invoices`, {

                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...invoiceData,
                        unitId,
                    })
                })

                if (!response.ok) {
                    const data = await response.json()
                    if (data.error === 'DUPLICATE_INVOICE') {
                        setError(data.message)
                        setUploading(false)
                        return
                    }
                    throw new Error(data.error || 'Error al crear factura')
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <AIProcessingOverlay
                visible={analyzing}
                message="Analizando documento..."
                subMessage="Extrayendo información clave con IA"
            />
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">

                <div className="flex items-center justify-between p-4 border-b border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-900">
                        {isEditMode ? 'Editar Factura' : 'Registrar Factura'}
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    {/* Error display */}
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex flex-col gap-2">
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
                        <div className="flex justify-end -mt-2 mb-2">
                            <AIConfidenceIndicator score={Math.round(aiConfidence * 100)} size="sm" />
                        </div>
                    )}


                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor *</label>
                        <select
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
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

                    {/* Cuenta de Cobro Checkbox */}
                    <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <input
                            type="checkbox"
                            id="isCuentaDeCobro"
                            checked={isCuentaDeCobro}
                            onChange={(e) => handleCuentaDeCobroChange(e.target.checked)}
                            className="w-4 h-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500"
                        />
                        <label htmlFor="isCuentaDeCobro" className="text-sm text-amber-800">
                            <span className="font-medium">Sin número de factura</span>
                            <span className="text-amber-600 ml-1">(Cuenta de Cobro)</span>
                        </label>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
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
                                    className={`w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none ${isCuentaDeCobro ? 'bg-gray-100 text-gray-600' : ''}`}
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
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Vencimiento</label>
                        <input
                            type="date"
                            value={form.dueDate}
                            onChange={(e) => setForm(f => ({ ...f, dueDate: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Subtotal (Base) *</label>
                            <input
                                type="number"
                                required
                                value={form.subtotal}
                                onChange={(e) => setForm(f => ({ ...f, subtotal: Number(e.target.value) }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">IVA</label>
                            <input
                                type="number"
                                value={form.taxIva}
                                onChange={(e) => setForm(f => ({ ...f, taxIva: Number(e.target.value) }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>
                    </div>

                    {/* Tax Retention Section */}
                    <div className="grid grid-cols-2 gap-4 bg-amber-50/50 p-3 rounded-lg border border-amber-100">
                        <div>
                            <label className="block text-xs font-semibold text-amber-800 mb-1 flex items-center gap-1">
                                Retefuente (Sugerida)
                            </label>
                            <input
                                type="number"
                                value={form.retefuenteAmount}
                                onChange={(e) => setForm(f => ({ ...f, retefuenteAmount: Number(e.target.value) }))}
                                className="w-full px-3 py-2 border border-amber-200 rounded-lg bg-white focus:ring-2 focus:ring-amber-500 text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-amber-800 mb-1 flex items-center gap-1">
                                ReteICA (Sugerida)
                            </label>
                            <input
                                type="number"
                                value={form.reteicaAmount}
                                onChange={(e) => setForm(f => ({ ...f, reteicaAmount: Number(e.target.value) }))}
                                className="w-full px-3 py-2 border border-amber-200 rounded-lg bg-white focus:ring-2 focus:ring-amber-500 text-sm"
                            />
                        </div>
                        <div className="col-span-2 pt-2 border-t border-amber-100 flex justify-between items-center">
                            <span className="text-xs font-medium text-amber-900">Valor Neto a Pagar:</span>
                            <span className="text-lg font-bold text-amber-700">
                                {formatMoney(Number(form.subtotal) + Number(form.taxIva) - Number(form.retefuenteAmount) - Number(form.reteicaAmount))}
                            </span>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Valor Total Facturado (con IVA)</label>
                        <input
                            type="number"
                            required
                            value={form.totalAmount}
                            onChange={(e) => setForm(f => ({ ...f, totalAmount: Number(e.target.value) }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-bold text-indigo-700"
                        />
                        <p className="text-[10px] text-gray-400 mt-1">* Debe coincidir con el total bruto de la factura</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                        <input
                            type="text"
                            value={form.description}
                            onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                            placeholder="Concepto de la factura..."
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Soporte (Factura Original)</label>
                        <div className="border border-dashed border-gray-300 rounded-lg p-4 text-center hover:bg-gray-50 transition-colors relative cursor-pointer">
                            <input
                                type="file"
                                accept="application/pdf,image/*"
                                onChange={(e) => setFile(e.target.files?.[0] || null)}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <div className="flex flex-col items-center gap-2 text-gray-500">
                                {file ? (
                                    <>
                                        <FileText className="w-8 h-8 text-indigo-600" />
                                        <span className="text-sm font-medium text-gray-900">{file.name}</span>
                                    </>
                                ) : (
                                    <>
                                        <Upload className="w-6 h-6" />
                                        <span className="text-sm">Arrastra o selecciona el archivo PDF/Imagen</span>
                                    </>
                                )}
                            </div>
                        </div>
                        {file && (
                            <AIButton
                                variant="primary"
                                size="sm"
                                loading={analyzing}
                                onClick={() => handleAIExtract(file)}
                                className="mt-2 w-full"
                            >
                                {analyzing ? 'Analizando con IA...' : 'Auto-completar con IA'}
                            </AIButton>

                        )}
                    </div>

                    <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3 rounded-b-xl">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white hover:text-gray-800 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={uploading || !form.providerId || !form.invoiceNumber || !form.subtotal}
                            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm shadow-indigo-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {uploading ? 'Guardando...' : (isEditMode ? 'Guardar Cambios' : 'Registrar Factura')}
                        </button>
                    </div>
                </form>
            </div >
        </div >
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
    const [scanningGmail, setScanningGmail] = useState(false)
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
    const { startBackgroundScan, scanState, minimizeScanUI, maximizeScanUI, dismissScanUI } = useAI()

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
        }
    }, [scanState.status, scanState.processedEmails, lastProcessedCount, queryClient])
}
    }, [scanState.status, scanState.processedEmails, queryClient]);


const handleGmailScan = async () => {
    if (!unitId) return

    if (startBackgroundScan) {
        await startBackgroundScan(unitId);
    } else {
        // Fallback if context not ready (shouldn't happen)
        console.error("AI Context not ready");
    }
}

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
const [feedbackComment, setFeedbackComment] = useState('')
const [suggestedRule, setSuggestedRule] = useState('')

const handleOpenFeedback = (inv: any) => {
    setFeedbackItem(inv)
    setFeedbackComment('')
    setSuggestedRule('')
    setShowFeedbackModal(true)
}

const handleSendFeedback = async () => {
    if (!feedbackItem || !feedbackComment) return;

    try {
        await sendAIFeedback({
            unitId,
            documentType: 'INVOICE',
            invoiceId: feedbackItem.id,
            comment: feedbackComment,
            suggestedRule
        });
        alert('Gracias por tu feedback. Hemos registrado la regla para mejorar la IA.');
        setShowFeedbackModal(false);
        setFeedbackItem(null);
    } catch (error) {
        console.error('Error sending feedback:', error);
        alert('Error al enviar feedback');
    }
}

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

        {/* Feedback Modal */}
        {showFeedbackModal && feedbackItem && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
                <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                    <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-amber-100 rounded-lg text-amber-600">
                                <Brain className="w-5 h-5" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900">Ayúdanos a Mejorar</h3>
                        </div>
                        <button onClick={() => setShowFeedbackModal(false)} className="text-gray-400 hover:text-gray-600">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="p-6 space-y-4 overflow-y-auto">
                        <div className="bg-gray-50 p-3 rounded-lg text-sm text-gray-600">
                            <p><strong>Documento:</strong> {feedbackItem.invoiceNumber}</p>
                            <p><strong>Fuente:</strong> {feedbackItem.source || 'GMAIL'}</p>
                            <p><strong>Asunto:</strong> {feedbackItem.emailSubject || 'N/A'}</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">¿Qué está mal?</label>
                            <textarea
                                className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                rows={3}
                                placeholder="Ej: El proveedor no es correcto, clasificó mal la fecha..."
                                value={feedbackComment}
                                onChange={(e) => setFeedbackComment(e.target.value)}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Regla Sugerida (Opcional)</label>
                            <textarea
                                className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-indigo-50/50"
                                rows={2}
                                placeholder="Ej: Si el asunto dice 'Cuenta de Cobro', ignorar..."
                                value={suggestedRule}
                                onChange={(e) => setSuggestedRule(e.target.value)}
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                Esta regla se añadirá a nuestra base de conocimiento para entrenar a la IA.
                            </p>
                        </div>
                    </div>

                    <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                        <button
                            onClick={() => setShowFeedbackModal(false)}
                            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg text-sm font-medium"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSendFeedback}
                            disabled={!feedbackComment}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            <Send className="w-4 h-4" />
                            Enviar Feedback
                        </button>
                    </div>
                </div>
            </div>
        )}


        <div className="space-y-6 animate-fade-in">
            {/* Header */}

            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Facturas (CxP)</h1>
                    <p className="text-sm text-gray-500 mt-1">Causación y control de deuda</p>
                </div>
                <div className="flex items-center gap-3">
                    {gmailStatus?.connected ? (
                        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 text-green-700 rounded-lg text-sm border border-green-200">
                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            <span className="font-medium">Conectado: {gmailStatus.email}</span>
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

                    <button
                        onClick={() => setShowPreviewModal(true)}
                        disabled={!gmailStatus?.connected}
                        className="px-3 py-2 border border-gray-200 text-gray-700 bg-white rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50"
                        title="Ver últimos correos para verificar acceso"
                    >
                        <Eye className="w-4 h-4" />
                        Buzón
                    </button>

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
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 shadow-sm flex items-center gap-2"
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
                                        <span className="font-mono text-sm font-medium text-indigo-600">{inv.invoiceNumber}</span>
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
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        try {
                                                            const url = inv.fileUrl!
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
                                                            } else {
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
            </div >

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
        </div >
    </>
)
}

