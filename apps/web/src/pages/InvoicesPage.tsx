import { Plus, Search, X, FileText, Upload, Loader2, Download, Trash2, Pencil, ChevronDown, Check, AlertTriangle, CheckCircle2, Mail, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getInvoices, getProviders, getInvoiceStats, updateInvoice, getNextCCNumber, deleteInvoice, scanGmail, connectGmail } from '../lib/api'
import { uploadFileToStorage } from '../lib/storage'
import { exportToExcel } from '../lib/exportExcel'
import { useUnit } from '../lib/UnitContext'
import type { Invoice, Provider } from '../lib/api'

// ... existing code ...

export default function InvoicesPage() {
    const { selectedUnit } = useUnit()
    const [searchParams] = useSearchParams()
    const unitId = selectedUnit?.id || ''

    const [search, setSearch] = useState(searchParams.get('search') || '')
    const [showModal, setShowModal] = useState(false)
    const [uploadInvoiceId, setUploadInvoiceId] = useState<string | null>(null)
    const [uploadingFile, setUploadingFile] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [scanningGmail, setScanningGmail] = useState(false)
    const [editingInvoice, setEditingInvoice] = useState<(Invoice & { provider?: { name: string } }) | null>(null)

    // ... existing state/methods ...

    const handleGmailScan = async () => {
        if (!unitId) return
        setScanningGmail(true)
        try {
            const res = await scanGmail(unitId)
            if (res.processedCount > 0) {
                alert(`¡Éxito! Se han importado ${res.processedCount} facturas desde Gmail.`)
                queryClient.invalidateQueries({ queryKey: ['invoices'] })
                queryClient.invalidateQueries({ queryKey: ['invoice-stats'] })
            } else {
                alert('No se encontraron nuevas facturas en los correos no leídos.')
            }
        } catch (error) {
            console.error('Error scanning Gmail:', error)
            alert('Error al escanear Gmail. Verifica si la cuenta está conectada.')
            // Ask to connect if failed
            if (confirm('¿Deseas conectar/reconectar la cuenta de Gmail ahora?')) {
                connectGmail(unitId)
            }
        } finally {
            setScanningGmail(false)
        }
    }

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Facturas (CxP)</h1>
                    <p className="text-sm text-gray-500 mt-1">Causación y control de deuda</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => connectGmail(unitId)}
                        className="px-3 py-2 border border-blue-200 text-blue-700 bg-blue-50 rounded-lg text-sm font-medium hover:bg-blue-100 flex items-center gap-2"
                        title="Conectar cuenta de Gmail para escanear facturas"
                    >
                        <Mail className="w-4 h-4" />
                        Conectar Gmail
                    </button>
                    <button
                        onClick={handleGmailScan}
                        disabled={scanningGmail}
                        className="px-3 py-2 border border-indigo-200 text-indigo-700 bg-indigo-50 rounded-lg text-sm font-medium hover:bg-indigo-100 flex items-center gap-2 disabled:opacity-50"
                        title="Escanear facturas en correos no leídos"
                    >
                        {scanningGmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        {scanningGmail ? 'Escaneando...' : 'Escanear Inbox'}
                    </button>
                    <button
                        onClick={() => {
                            const dataToExport = filtered.map((inv: any) => ({
                                invoiceNumber: inv.invoiceNumber,
                                provider: inv.provider?.name || '',
                                invoiceDate: inv.invoiceDate,
                                dueDate: inv.dueDate,
                                description: inv.description,
                                baseAmount: Number(inv.baseAmount),
                                ivaAmount: Number(inv.ivaAmount),
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
                                <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Soporte Factura</th>
                                <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Estado</th>
                                <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filtered.map((inv: Invoice & { provider?: { name: string }; balance?: number; fileUrl?: string }) => (
                                <tr key={inv.id} className="hover:bg-gray-50/50 cursor-pointer">
                                    <td className="px-4 py-3">
                                        <span className="font-mono text-sm font-medium text-indigo-600">{inv.invoiceNumber}</span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <p className="font-medium text-gray-900">{inv.provider?.name || 'N/A'}</p>
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
                                                    console.log('Input element found:', !!input)
                                                    if (input) {
                                                        input.click()
                                                    } else {
                                                        alert('Error: No se encontró el campo de carga. Recarga la página.')
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
        </div >
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
        description: initialData?.description || ''
    })

    const [file, setFile] = useState<File | null>(null)
    const [uploading, setUploading] = useState(false)
    const [isCuentaDeCobro, setIsCuentaDeCobro] = useState(initialData?.isAutogenerated || false)
    const [loadingCCNumber, setLoadingCCNumber] = useState(false)
    const [error, setError] = useState<string | null>(null)

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

            if (isEditMode) {
                await updateInvoice(initialData.id, {
                    ...form,
                    fileUrl: fileUrl || initialData.fileUrl,
                    isAutogenerated: isCuentaDeCobro,
                    totalAmount: Number(form.subtotal) + Number(form.taxIva)
                })
            } else {
                const response = await fetch('/api/invoices', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...form,
                        unitId,
                        fileUrl,
                        isAutogenerated: isCuentaDeCobro
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

    const total = Number(form.subtotal) + Number(form.taxIva)

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
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
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                            {error}
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor *</label>
                        <SearchableSelect
                            options={providers.map((p: Provider) => ({
                                value: p.id,
                                label: `${p.name} (${p.nit}${p.dv ? `-${p.dv}` : ''})`
                            }))}
                            value={form.providerId}
                            onChange={(val) => setForm(f => ({ ...f, providerId: val }))}
                            placeholder="Buscar proveedor..."
                        />
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

                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Subtotal *</label>
                            <input
                                type="number"
                                value={form.subtotal || ''}
                                onChange={(e) => setForm(f => ({ ...f, subtotal: parseFloat(e.target.value) || 0 }))}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">IVA</label>
                            <input
                                type="number"
                                value={form.taxIva || ''}
                                onChange={(e) => setForm(f => ({ ...f, taxIva: parseFloat(e.target.value) || 0 }))}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Total</label>
                            <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-semibold text-gray-900">
                                {formatMoney(total)}
                            </div>
                        </div>
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
            </div>
        </div>
    )
}
