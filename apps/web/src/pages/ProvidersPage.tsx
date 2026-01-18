import { Plus, Search, X, Check, Edit2, FileText, FileSpreadsheet, Eye } from 'lucide-react'
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getProviders, createProvider, updateProvider, validateNit, API_BASE } from '../lib/api'

import type { Provider } from '../lib/api'
import { uploadFileToStorage } from '../lib/storage'
import BulkImportModal from '../components/BulkImportModal'

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);
        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);
    return debouncedValue;
}

export default function ProvidersPage() {
    const [search, setSearch] = useState('')
    const [selectedCategory, setSelectedCategory] = useState('')

    const debouncedSearch = useDebounce(search, 500) // Debounce 500ms
    const [showModal, setShowModal] = useState(false)
    const [showBulkImport, setShowBulkImport] = useState(false)
    const [editingProvider, setEditingProvider] = useState<Provider | null>(null)
    const queryClient = useQueryClient()

    const { data, isLoading } = useQuery({
        queryKey: ['providers', debouncedSearch, selectedCategory], // Include search in key
        queryFn: () => getProviders({ search: debouncedSearch, category: selectedCategory }) // Pass search to API
    })

    const providers: Provider[] = data?.providers || []

    // Client-side filter removed, using backend results
    const filtered = providers


    const handleEdit = (provider: Provider) => {
        setEditingProvider(provider)
        setShowModal(true)
    }

    const handleCloseModal = () => {
        setShowModal(false)
        setEditingProvider(null)
    }

    return (
        <>
            <div className="space-y-6 animate-fade-in">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Proveedores</h1>
                        <p className="text-sm text-gray-500 mt-1">Gestiona los terceros (disponibles para todas las unidades)</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setShowBulkImport(true)}
                            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center gap-2"
                        >
                            <FileSpreadsheet className="w-4 h-4" />
                            Importar Excel
                        </button>
                        <button
                            onClick={() => setShowModal(true)}
                            className="px-4 py-2 bg-brand-primary text-white rounded-button text-sm font-medium hover:bg-brand-700 shadow-sm flex items-center gap-2"
                        >
                            <Plus className="w-4 h-4" />
                            Nuevo Proveedor
                        </button>
                    </div>
                </div>

                {/* Filters */}
                <div className="card p-4">
                    <div className="flex items-center gap-4">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar por nombre o NIT..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                            />
                        </div>
                        <select
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                            className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        >
                            <option value="">Todas las categorías</option>
                            <option value="servicios_publicos">Servicios Públicos</option>
                            <option value="seguridad">Seguridad</option>
                            <option value="aseo">Aseo</option>
                            <option value="mantenimiento">Mantenimiento</option>
                            <option value="seguros">Seguros</option>
                            <option value="legales">Legales</option>
                            <option value="insumos">Insumos</option>
                            <option value="otro">Otro</option>
                        </select>

                        <div className="text-sm text-gray-500">
                            {filtered.length} de {providers.length} proveedores
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="card overflow-x-auto">
                    {isLoading ? (
                        <div className="p-8 text-center text-gray-500">Cargando proveedores...</div>
                    ) : providers.length === 0 ? (
                        <div className="p-8 text-center">
                            <p className="text-gray-500">No hay proveedores registrados</p>
                            <button
                                onClick={() => setShowModal(true)}
                                className="mt-4 text-indigo-600 hover:text-indigo-700 font-medium text-sm"
                            >
                                + Agregar primer proveedor
                            </button>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead className="bg-gray-50 border-b border-gray-100">
                                <tr>
                                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Proveedor</th>
                                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">NIT</th>
                                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Tipo</th>
                                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Categoría</th>
                                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">ReteFte</th>
                                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Docs</th>
                                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Estado</th>
                                    <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filtered.map((provider: Provider) => (
                                    <tr key={provider.id} className="hover:bg-gray-50/50">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <p className="font-medium text-gray-900">{provider.name}</p>
                                                {provider.isRecurring && (
                                                    <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">
                                                        🔄
                                                    </span>
                                                )}
                                            </div>
                                            {provider.email && (
                                                <p className="text-xs text-gray-500">{provider.email}</p>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="font-mono text-sm text-gray-600">{provider.nit}-{provider.dv}</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="text-sm text-gray-600">{provider.taxType}</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="text-sm text-gray-600 capitalize">{provider.category?.replace('_', ' ') || '-'}</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="text-sm text-gray-600">{provider.defaultRetefuentePerc}%</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`text-xs px-2 py-0.5 rounded-full ${(provider._count?.documents || 0) > 0
                                                ? 'bg-emerald-100 text-emerald-700'
                                                : 'bg-gray-100 text-gray-500'
                                                }`}>
                                                {provider._count?.documents || 0} docs
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`status-pill ${provider.status === 'ACTIVE' ? 'status-paid' : 'status-pending'}`}>
                                                {provider.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <Link
                                                    to={`/providers/${provider.id}`}
                                                    className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-indigo-600"
                                                    title="Ver detalle"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </Link>
                                                <button
                                                    onClick={() => handleEdit(provider)}
                                                    className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-indigo-600"
                                                    title="Editar"
                                                >
                                                    <Edit2 className="w-4 h-4" />
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

            {/* Modal - Moved outside animate-fade-in to prevent fixed positioning context issues */}
            {
                showModal && (
                    <ProviderModal
                        provider={editingProvider}
                        onClose={handleCloseModal}
                        onSuccess={() => {
                            handleCloseModal()
                            queryClient.invalidateQueries({ queryKey: ['providers'] })
                        }}
                    />
                )
            }

            {/* Bulk Import Modal */}
            {
                showBulkImport && (
                    <BulkImportModal
                        onClose={() => setShowBulkImport(false)}
                        onSuccess={() => {
                            setShowBulkImport(false)
                            queryClient.invalidateQueries({ queryKey: ['providers'] })
                        }}
                    />
                )
            }
        </>
    )
}

function ProviderModal({ provider, onClose, onSuccess }: {
    provider: Provider | null
    onClose: () => void
    onSuccess: () => void
}) {
    const isEditing = !!provider
    const [activeTab, setActiveTab] = useState<'info' | 'documents'>('info')

    const [form, setForm] = useState({
        name: provider?.name || '',
        taxType: provider?.taxType || 'NIT',
        nit: provider?.nit || '',
        dv: provider?.dv || '',
        email: provider?.email || '',
        phone: provider?.phone || '',
        address: provider?.address || '',
        city: provider?.city || '',
        bankAccount: provider?.bankAccount || '',
        bankName: provider?.bankName || '',
        accountType: provider?.accountType || '',
        defaultRetefuentePerc: provider?.defaultRetefuentePerc || 7,
        defaultReteicaPerc: provider?.defaultReteicaPerc || 0.5,
        isRecurring: provider?.isRecurring || false,
        recurringCategory: provider?.recurringCategory || '',
        category: provider?.category || '',
        status: provider?.status || 'ACTIVE'
    })
    const [dvValidated, setDvValidated] = useState(isEditing)
    const [nitExists, setNitExists] = useState(false)

    const createMutation = useMutation({
        mutationFn: () => createProvider(form),
        onSuccess
    })

    const updateMutation = useMutation({
        mutationFn: () => updateProvider(provider!.id, form),
        onSuccess
    })

    const handleNitBlur = async () => {
        if (form.nit.length >= 6) {
            const result = await validateNit(form.nit)
            setForm(f => ({ ...f, dv: result.dv }))
            setDvValidated(true)
            setNitExists(result.exists && (!isEditing || result.existingProvider?.id !== provider?.id))
        }
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (isEditing) {
            updateMutation.mutate()
        } else {
            createMutation.mutate()
        }
    }

    const isPending = createMutation.isPending || updateMutation.isPending

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col" style={{ backgroundColor: '#ffffff', minHeight: '200px', display: 'flex' }}>
                <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
                    <h2 className="text-lg font-semibold text-gray-900">
                        {isEditing ? 'Editar Proveedor' : 'Nuevo Proveedor'}
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* Tabs */}
                {isEditing && (
                    <div className="flex border-b bg-gray-50">
                        <button
                            onClick={() => setActiveTab('info')}
                            className={`px-4 py-2.5 text-sm font-medium ${activeTab === 'info' ? 'border-b-2 border-indigo-600 text-indigo-600 bg-white' : 'text-gray-500'}`}
                        >
                            Información
                        </button>
                        <button
                            onClick={() => setActiveTab('documents')}
                            className={`px-4 py-2.5 text-sm font-medium ${activeTab === 'documents' ? 'border-b-2 border-indigo-600 text-indigo-600 bg-white' : 'text-gray-500'}`}
                        >
                            Documentos
                        </button>
                    </div>
                )}

                <div className="overflow-y-auto flex-1">
                    {activeTab === 'info' ? (
                        <form onSubmit={handleSubmit} className="p-4 space-y-4">
                            {/* Basic Info */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre / Razón Social *</label>
                                <input
                                    type="text"
                                    value={form.name}
                                    onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div className="col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">NIT *</label>
                                    <input
                                        type="text"
                                        value={form.nit}
                                        onChange={(e) => { setForm(f => ({ ...f, nit: e.target.value })); setDvValidated(false); setNitExists(false) }}
                                        onBlur={handleNitBlur}
                                        placeholder="900123456"
                                        className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-mono ${nitExists ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                                        required
                                        disabled={isEditing}
                                    />
                                    {nitExists && (
                                        <p className="text-xs text-red-600 mt-1">Este NIT ya está registrado</p>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">DV</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={form.dv}
                                            readOnly
                                            className="w-16 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 font-mono text-center"
                                        />
                                        {dvValidated && <Check className="w-5 h-5 text-green-500" />}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Contribuyente *</label>
                                    <select
                                        value={form.taxType}
                                        onChange={(e) => setForm(f => ({ ...f, taxType: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                    >
                                        <option value="NIT">NIT (Persona Jurídica)</option>
                                        <option value="CC">Cédula de Ciudadanía</option>
                                        <option value="CE">Cédula de Extranjería</option>
                                        <option value="RUT">RUT (Persona Natural)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                                    <select
                                        value={form.status}
                                        onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                    >
                                        <option value="ACTIVE">Activo</option>
                                        <option value="INACTIVE">Inactivo</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
                                <select
                                    value={form.category}
                                    onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                >
                                    <option value="">Sin categoría</option>
                                    <option value="servicios_publicos">Servicios Públicos</option>
                                    <option value="seguridad">Seguridad</option>
                                    <option value="aseo">Aseo</option>
                                    <option value="mantenimiento">Mantenimiento</option>
                                    <option value="seguros">Seguros</option>
                                    <option value="legales">Legales</option>
                                    <option value="insumos">Insumos</option>
                                    <option value="otro">Otro</option>
                                </select>
                            </div>

                            {/* Contact */}
                            <div className="pt-2 border-t">
                                <h4 className="text-sm font-medium text-gray-700 mb-3">Contacto</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">Email</label>
                                        <input
                                            type="email"
                                            value={form.email}
                                            onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">Teléfono</label>
                                        <input
                                            type="text"
                                            value={form.phone}
                                            onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">Dirección</label>
                                        <input
                                            type="text"
                                            value={form.address}
                                            onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">Ciudad</label>
                                        <input
                                            type="text"
                                            value={form.city}
                                            onChange={(e) => setForm(f => ({ ...f, city: e.target.value }))}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Bank Info */}
                            <div className="pt-2 border-t">
                                <h4 className="text-sm font-medium text-gray-700 mb-3">Datos Bancarios</h4>
                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">Banco</label>
                                        <input
                                            type="text"
                                            value={form.bankName}
                                            onChange={(e) => setForm(f => ({ ...f, bankName: e.target.value }))}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">Número de Cuenta</label>
                                        <input
                                            type="text"
                                            value={form.bankAccount}
                                            onChange={(e) => setForm(f => ({ ...f, bankAccount: e.target.value }))}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none font-mono"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">Tipo de Cuenta</label>
                                        <select
                                            value={form.accountType}
                                            onChange={(e) => setForm(f => ({ ...f, accountType: e.target.value }))}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none"
                                        >
                                            <option value="">Seleccionar...</option>
                                            <option value="AHORROS">Ahorros</option>
                                            <option value="CORRIENTE">Corriente</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Retentions */}
                            <div className="pt-2 border-t">
                                <h4 className="text-sm font-medium text-gray-700 mb-3">Retenciones por Defecto</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">% Retención Fuente</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={form.defaultRetefuentePerc}
                                            onChange={(e) => setForm(f => ({ ...f, defaultRetefuentePerc: parseFloat(e.target.value) || 0 }))}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">% Retención ICA</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={form.defaultReteicaPerc}
                                            onChange={(e) => setForm(f => ({ ...f, defaultReteicaPerc: parseFloat(e.target.value) || 0 }))}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Recurring */}


                            <div className="flex justify-end gap-3 pt-4 border-t">
                                <button type="button" onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg text-sm font-medium">
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={isPending || !form.name || !form.nit || nitExists}
                                    className="px-4 py-2 bg-brand-primary text-white rounded-button text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
                                >
                                    {isPending ? 'Guardando...' : isEditing ? 'Actualizar' : 'Guardar Proveedor'}
                                </button>
                            </div>
                        </form>
                    ) : (
                        <DocumentsTab providerId={provider!.id} />
                    )}
                </div>
            </div>
        </div>
    )
}

// Documents Tab Component
function DocumentsTab({ providerId }: { providerId: string }) {
    const queryClient = useQueryClient()
    const [showUploadForm, setShowUploadForm] = useState(false)
    const [uploadForm, setUploadForm] = useState({
        type: 'rut',
        expiresAt: '',
        notes: '',
        file: null as File | null
    })
    const [uploading, setUploading] = useState(false)

    // Fetch documents
    const { data: docsData, isLoading } = useQuery({
        queryKey: ['provider-documents', providerId],
        queryFn: async () => {
            const res = await fetch(`${API_BASE}/providers/${providerId}/documents`)

            return res.json()
        }
    })

    const documents = docsData?.documents || []

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            setUploadForm(f => ({ ...f, file }))
        }
    }

    const handleUpload = async () => {
        if (!uploadForm.file) return

        setUploading(true)
        try {
            // Upload to Firebase Storage (converts images to PDF automatically)
            // Path: providers/{providerId}/documents
            const { url, fileName } = await uploadFileToStorage(
                uploadForm.file,
                `providers/${providerId}/documents`
            )

            await fetch(`${API_BASE}/providers/${providerId}/documents`, {

                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: uploadForm.type,
                    fileName: fileName,
                    fileUrl: url,
                    fileSize: uploadForm.file.size, // Original size might differ from PDF size but it's okay for reference
                    expiresAt: uploadForm.expiresAt || null,
                    notes: uploadForm.notes
                })
            })

            queryClient.invalidateQueries({ queryKey: ['provider-documents', providerId] })
            setShowUploadForm(false)
            setUploadForm({ type: 'rut', expiresAt: '', notes: '', file: null })
            setUploading(false)
        } catch (error) {
            console.error('Upload error:', error)
            alert('Error al subir documento: ' + (error instanceof Error ? error.message : String(error)))
            setUploading(false)
        }
    }

    const handleDelete = async (docId: string) => {
        if (!confirm('¿Eliminar este documento?')) return

        await fetch(`${API_BASE}/providers/${providerId}/documents/${docId}`, {

            method: 'DELETE'
        })
        queryClient.invalidateQueries({ queryKey: ['provider-documents', providerId] })
    }

    const typeLabels: Record<string, string> = {
        rut: '📄 RUT',
        pila: '📋 Planilla PILA',
        cert_bancaria: '🏦 Cert. Bancaria',
        contrato: '📝 Contrato',
        otro: '📎 Otro'
    }

    return (
        <div className="p-4 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h4 className="font-medium text-gray-700">Documentos del Proveedor</h4>
                {!showUploadForm && (
                    <button
                        onClick={() => setShowUploadForm(true)}
                        className="px-3 py-1.5 bg-brand-primary text-white rounded-button text-xs font-medium hover:bg-brand-700 flex items-center gap-1"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Agregar Documento
                    </button>
                )}
            </div>

            {/* Upload Form */}
            {showUploadForm && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Tipo de Documento</label>
                            <select
                                value={uploadForm.type}
                                onChange={(e) => setUploadForm(f => ({ ...f, type: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                            >
                                <option value="rut">📄 RUT</option>
                                <option value="pila">📋 Planilla PILA (EPS/Pensión/ARL)</option>
                                <option value="cert_bancaria">🏦 Certificación Bancaria</option>
                                <option value="contrato">📝 Contrato</option>
                                <option value="otro">📎 Otro</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Fecha de Vencimiento</label>
                            <input
                                type="date"
                                value={uploadForm.expiresAt}
                                onChange={(e) => setUploadForm(f => ({ ...f, expiresAt: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Archivo</label>
                        <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                            onChange={handleFileChange}
                            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-button file:border-0 file:text-sm file:font-medium file:bg-brand-100 file:text-brand-700 hover:file:bg-brand-200"
                        />
                        {uploadForm.file && (
                            <p className="text-xs text-gray-500 mt-1">{uploadForm.file.name} ({(uploadForm.file.size / 1024).toFixed(1)} KB)</p>
                        )}
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Notas (opcional)</label>
                        <input
                            type="text"
                            value={uploadForm.notes}
                            onChange={(e) => setUploadForm(f => ({ ...f, notes: e.target.value }))}
                            placeholder="Ej: Vigente hasta diciembre 2025"
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        />
                    </div>
                    <div className="flex justify-end gap-2">
                        <button
                            onClick={() => setShowUploadForm(false)}
                            className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-lg text-sm"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleUpload}
                            disabled={!uploadForm.file || uploading}
                            className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                        >
                            {uploading ? 'Subiendo...' : 'Subir Documento'}
                        </button>
                    </div>
                </div>
            )}

            {/* Documents List */}
            {isLoading ? (
                <p className="text-sm text-gray-500 text-center py-4">Cargando documentos...</p>
            ) : documents.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                    <FileText className="w-10 h-10 mx-auto mb-2" />
                    <p className="text-sm">No hay documentos registrados</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {documents.map((doc: any) => {
                        const isExpired = doc.expiresAt && new Date(doc.expiresAt) < new Date()
                        const expiresSoon = doc.expiresAt && !isExpired &&
                            new Date(doc.expiresAt) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

                        return (
                            <div
                                key={doc.id}
                                className={`flex items-center justify-between p-3 rounded-lg border ${isExpired ? 'bg-red-50 border-red-200' :
                                    expiresSoon ? 'bg-amber-50 border-amber-200' :
                                        'bg-gray-50 border-gray-200'
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    <span className="text-lg">{typeLabels[doc.type]?.split(' ')[0] || '📎'}</span>
                                    <div>
                                        <p className="font-medium text-sm text-gray-800">{doc.fileName}</p>
                                        <div className="flex items-center gap-2 text-xs text-gray-500">
                                            <span>{typeLabels[doc.type]?.split(' ').slice(1).join(' ') || doc.type}</span>
                                            {doc.expiresAt && (
                                                <span className={isExpired ? 'text-red-600 font-medium' : expiresSoon ? 'text-amber-600' : ''}>
                                                    • {isExpired ? '⚠️ Vencido' : `Vence: ${new Date(doc.expiresAt).toLocaleDateString('es-CO')}`}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleDelete(doc.id)}
                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                                    title="Eliminar"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
