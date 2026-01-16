import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Building2, X, Loader2, Upload, User, Wallet, Settings, LayoutGrid } from 'lucide-react'
import { getUnits, createUnit, updateUnit, deleteUnit, getProviders, uploadFile } from '../lib/api'
import type { Provider } from '../lib/api'

// Unit interface is not exported from api.ts, so we'll keep it here or match api.ts if it exists there.
// Looking at api.ts content previously viewed, createUnit/updateUnit etc take args but don't export a 'Unit' interface for the full object return.
// However, api.ts functions return `res.json()`.
// Let's define the interface locally to match what the API returns, or inspect api.ts again to see if we can export it.
// For now, fast fix: keep interface but use imported functions.

interface Unit {
    id: string
    name: string
    taxId: string
    address?: string
    email?: string
    logoUrl?: string
    observations?: string
    bankAccountInfo?: string
    propertyType: 'RESIDENTIAL' | 'COMMERCIAL' | 'MIXED'
    totalTowers?: number
    totalUnits?: number
    defaultPaymentType: 'INTERNAL' | 'EXTERNAL'
    consecutiveSeed: number
    accountantId?: string
    adminId?: string
    fiscalRevisorId?: string
}

export default function UnitsPage() {
    const [showModal, setShowModal] = useState(false)
    const [editingUnit, setEditingUnit] = useState<Unit | null>(null)
    const queryClient = useQueryClient()

    const { data, isLoading } = useQuery({
        queryKey: ['units'],
        queryFn: getUnits
    })

    const units = data?.units || []

    const createMutation = useMutation({
        mutationFn: createUnit,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['units'] })
            setShowModal(false)
        },
        onError: (error: any) => {
            console.error('Error creating unit:', error)
            alert('Error al crear la unidad: ' + (error.message || 'Error desconocido'))
        }
    })

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<Unit> }) => updateUnit(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['units'] })
            setEditingUnit(null)
            setShowModal(false)
        },
        onError: (error: any) => {
            console.error('Error updating unit:', error)
            alert('Error al actualizar la unidad: ' + (error.message || 'Error desconocido'))
        }
    })

    const deleteMutation = useMutation({
        mutationFn: deleteUnit,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['units'] })
        }
    })

    const handleDelete = (unit: Unit) => {
        if (confirm(`¿Eliminar la unidad "${unit.name}"? Esta acción no se puede deshacer.`)) {
            deleteMutation.mutate(unit.id)
        }
    }

    const openEditModal = (unit: Unit) => {
        setEditingUnit(unit)
        setShowModal(true)
    }

    const openCreateModal = () => {
        setEditingUnit(null)
        setShowModal(true)
    }

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Unidades</h1>
                    <p className="text-sm text-gray-500 mt-1">Propiedades horizontales administradas</p>
                </div>
                <button
                    onClick={openCreateModal}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 shadow-sm flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    Nueva Unidad
                </button>
            </div>

            {/* Units Grid */}
            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                </div>
            ) : units.length === 0 ? (
                <div className="card p-12 text-center">
                    <Building2 className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No hay unidades registradas</h3>
                    <p className="text-gray-500 mb-4">Crea tu primera unidad para comenzar.</p>
                    <button
                        onClick={openCreateModal}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
                    >
                        Crear Primera Unidad
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {units.map(unit => (
                        <div key={unit.id} className="card p-5 hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 bg-gray-50 border border-gray-100 rounded-xl flex items-center justify-center overflow-hidden shadow-sm">
                                        {unit.logoUrl ? (
                                            <img
                                                src={unit.logoUrl}
                                                alt={unit.name}
                                                className="w-full h-full object-contain p-1"
                                                onError={(e) => {
                                                    // Hide broken image and show fallback icon
                                                    (e.target as HTMLImageElement).style.display = 'none';
                                                    const parent = (e.target as HTMLImageElement).parentElement;
                                                    if (parent && !parent.querySelector('.fallback-icon')) {
                                                        const icon = document.createElement('div');
                                                        icon.className = 'fallback-icon';
                                                        icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6 text-indigo-500"><path d="M6 22V4c0-.5.2-1 .6-1.4C7 2.2 7.5 2 8 2h8c.5 0 1 .2 1.4.6.4.4.6.9.6 1.4v18"/><path d="M6 18h12"/><path d="M10 22v-4a2 2 0 0 1 2-2 2 2 0 0 1 2 2v4"/><path d="M2 22h20"/><path d="M9 6h2"/><path d="M9 10h2"/><path d="M13 6h2"/><path d="M13 10h2"/></svg>';
                                                        parent.appendChild(icon);
                                                    }
                                                }}
                                            />
                                        ) : (
                                            <Building2 className="w-6 h-6 text-indigo-500" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-semibold text-gray-900 truncate" title={unit.name}>{unit.name}</h3>
                                        <p className="text-sm text-gray-500">NIT: {unit.taxId}</p>
                                    </div>
                                </div>
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => openEditModal(unit)}
                                        className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                        title="Editar"
                                    >
                                        <Pencil className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(unit)}
                                        disabled={deleteMutation.isPending}
                                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                                        title="Eliminar"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            {unit.address && (
                                <p className="mt-3 text-sm text-gray-500 pl-15">{unit.address}</p>
                            )}
                            <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-center text-xs text-gray-400">
                                <span>Consecutivo: CE-{unit.consecutiveSeed || 1}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Create/Edit Modal */}
            {showModal && (
                <UnitModal
                    unit={editingUnit}
                    onClose={() => {
                        setShowModal(false)
                        setEditingUnit(null)
                    }}
                    onSave={(data) => {
                        if (editingUnit) {
                            updateMutation.mutate({ id: editingUnit.id, data })
                        } else {
                            createMutation.mutate(data as Omit<Unit, 'id'>)
                        }
                    }}
                    isLoading={createMutation.isPending || updateMutation.isPending}
                />
            )}
        </div>
    )
}

// Modal Component
const TABS = [
    { id: 'general', label: 'General', icon: Building2 },
    { id: 'structural', label: 'Estructura', icon: LayoutGrid },
    { id: 'financial', label: 'Financiero', icon: Wallet },
    { id: 'team', label: 'Equipo', icon: User },
    { id: 'config', label: 'Configuración', icon: Settings },
] as const

function UnitModal({
    unit,
    onClose,
    onSave,
    isLoading
}: {
    unit: Unit | null
    onClose: () => void
    onSave: (data: Partial<Unit>) => void
    isLoading: boolean
}) {
    const [activeTab, setActiveTab] = useState<typeof TABS[number]['id']>('general')
    const [uploadingLogo, setUploadingLogo] = useState(false)
    const [logoMode, setLogoMode] = useState<'URL' | 'FILE'>('URL')

    // Form State
    const [form, setForm] = useState<Partial<Unit>>({
        name: unit?.name || '',
        taxId: unit?.taxId || '',
        address: unit?.address || '',
        email: unit?.email || '',
        logoUrl: unit?.logoUrl || '',
        observations: unit?.observations || '',
        bankAccountInfo: unit?.bankAccountInfo || '',
        propertyType: unit?.propertyType || 'RESIDENTIAL',
        totalTowers: unit?.totalTowers || undefined,
        totalUnits: unit?.totalUnits || undefined,
        defaultPaymentType: unit?.defaultPaymentType || 'INTERNAL',
        consecutiveSeed: unit?.consecutiveSeed || 1,
        accountantId: unit?.accountantId || '',
        adminId: unit?.adminId || '',
        fiscalRevisorId: unit?.fiscalRevisorId || ''
    })

    // Fetch Providers for Team Selection
    const { data: providersData } = useQuery({
        queryKey: ['providers'],
        queryFn: () => getProviders()
    })
    const providers = (providersData as any)?.providers || []

    const handleChange = (field: keyof Unit, value: any) => {
        setForm(prev => ({ ...prev, [field]: value }))
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!form.name?.trim() || !form.taxId?.trim()) {
            alert('Nombre y NIT son requeridos')
            return
        }
        onSave(form)
    }

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        try {
            setUploadingLogo(true)
            const url = await uploadFile(file, 'logos')
            handleChange('logoUrl', url)
        } catch (error) {
            console.error(error)
            alert('Error al subir el logo')
        } finally {
            setUploadingLogo(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                            <Building2 className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">
                                {unit ? 'Editar Unidad' : 'Nueva Unidad'}
                            </h2>
                            <p className="text-sm text-gray-500">Gestión de perfil y configuración</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Sidebar Tabs */}
                    <div className="w-64 bg-gray-50 border-r overflow-y-auto p-4 space-y-2">
                        {TABS.map(tab => {
                            const Icon = tab.icon
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`w-full flex items-center gap-3 p-3 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.id
                                        ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-gray-200'
                                        : 'text-gray-600 hover:bg-white hover:text-gray-900'
                                        }`}
                                >
                                    <Icon className="w-4 h-4" />
                                    {tab.label}
                                </button>
                            )
                        })}
                    </div>

                    {/* Content */}
                    <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">

                        {/* GENERAL TAB */}
                        {activeTab === 'general' && (
                            <div className="space-y-4">
                                <h3 className="text-lg font-medium text-gray-900 border-b pb-2 mb-4">Información General</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="col-span-2">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de la Unidad *</label>
                                        <input
                                            type="text"
                                            value={form.name}
                                            onChange={e => handleChange('name', e.target.value)}
                                            className="w-full px-3 py-2 border rounded-lg"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">NIT *</label>
                                        <input
                                            type="text"
                                            value={form.taxId}
                                            onChange={e => handleChange('taxId', e.target.value)}
                                            className="w-full px-3 py-2 border rounded-lg"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Correo Electrónico</label>
                                        <input
                                            type="email"
                                            value={form.email}
                                            onChange={e => handleChange('email', e.target.value)}
                                            className="w-full px-3 py-2 border rounded-lg"
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
                                        <input
                                            type="text"
                                            value={form.address}
                                            onChange={e => handleChange('address', e.target.value)}
                                            className="w-full px-3 py-2 border rounded-lg"
                                        />
                                    </div>

                                    <div className="col-span-2">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Logo de la Unidad</label>

                                        <div className="flex gap-4 mb-2">
                                            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                                                <input
                                                    type="radio"
                                                    name="logoMode"
                                                    checked={logoMode === 'URL'}
                                                    onChange={() => setLogoMode('URL')}
                                                    className="text-indigo-600 focus:ring-indigo-500"
                                                />
                                                <span>Pegar URL</span>
                                            </label>
                                            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                                                <input
                                                    type="radio"
                                                    name="logoMode"
                                                    checked={logoMode === 'FILE'}
                                                    onChange={() => setLogoMode('FILE')}
                                                    className="text-indigo-600 focus:ring-indigo-500"
                                                />
                                                <span>Subir Imagen</span>
                                            </label>
                                        </div>

                                        {logoMode === 'URL' ? (
                                            <input
                                                type="text"
                                                value={form.logoUrl}
                                                onChange={e => handleChange('logoUrl', e.target.value)}
                                                placeholder="https://..."
                                                className="w-full px-3 py-2 border rounded-lg"
                                            />
                                        ) : (
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={handleLogoUpload}
                                                    className="block w-full text-sm text-gray-500
                                                        file:mr-4 file:py-2 file:px-4
                                                        file:rounded-lg file:border-0
                                                        file:text-sm file:font-semibold
                                                        file:bg-indigo-50 file:text-indigo-700
                                                        hover:file:bg-indigo-100
                                                    "
                                                    disabled={uploadingLogo}
                                                />
                                                {uploadingLogo && <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />}
                                            </div>
                                        )}

                                        {/* Preview */}
                                        {form.logoUrl && (
                                            <div className="mt-2 p-2 border rounded-lg inline-block bg-gray-50">
                                                <img src={form.logoUrl} alt="Logo Preview" className="h-16 object-contain" />
                                            </div>
                                        )}
                                    </div>

                                    <div className="col-span-2">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones</label>
                                        <textarea
                                            value={form.observations}
                                            onChange={e => handleChange('observations', e.target.value)}
                                            rows={3}
                                            className="w-full px-3 py-2 border rounded-lg"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* STRUCTURAL TAB */}
                        {activeTab === 'structural' && (
                            <div className="space-y-4">
                                <h3 className="text-lg font-medium text-gray-900 border-b pb-2 mb-4">Detalles Estructurales</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="col-span-2">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Propiedad</label>
                                        <select
                                            value={form.propertyType}
                                            onChange={e => handleChange('propertyType', e.target.value)}
                                            className="w-full px-3 py-2 border rounded-lg"
                                        >
                                            <option value="RESIDENTIAL">Residencial</option>
                                            <option value="COMMERCIAL">Comercial</option>
                                            <option value="MIXED">Mixta</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Total Torres/Bloques</label>
                                        <input
                                            type="number"
                                            value={form.totalTowers || ''}
                                            onChange={e => handleChange('totalTowers', parseInt(e.target.value) || undefined)}
                                            className="w-full px-3 py-2 border rounded-lg"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Total Unidades Privadas</label>
                                        <input
                                            type="number"
                                            value={form.totalUnits || ''}
                                            onChange={e => handleChange('totalUnits', parseInt(e.target.value) || undefined)}
                                            className="w-full px-3 py-2 border rounded-lg"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* FINANCIAL TAB */}
                        {activeTab === 'financial' && (
                            <div className="space-y-4">
                                <h3 className="text-lg font-medium text-gray-900 border-b pb-2 mb-4">Información Financiera</h3>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Información de Cuentas Bancarias</label>
                                    <p className="text-xs text-gray-500 mb-2">Instrucciones de pago para los residentes (Bancos, Números de cuenta, Titular).</p>
                                    <textarea
                                        value={form.bankAccountInfo}
                                        onChange={e => handleChange('bankAccountInfo', e.target.value)}
                                        rows={6}
                                        placeholder="Ej: Bancolombia Ahorros #..."
                                        className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
                                    />
                                </div>
                            </div>
                        )}

                        {/* CONFIG TAB */}
                        {activeTab === 'config' && (
                            <div className="space-y-4">
                                <h3 className="text-lg font-medium text-gray-900 border-b pb-2 mb-4">Configuración de Comprobantes</h3>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Comprobante Predeterminado</label>
                                        <select
                                            value={form.defaultPaymentType}
                                            onChange={e => handleChange('defaultPaymentType', e.target.value)}
                                            className="w-full px-3 py-2 border rounded-lg"
                                        >
                                            <option value="INTERNAL">Interno (Generación Automática)</option>
                                            <option value="EXTERNAL">Externo (Cargado Manualmente)</option>
                                        </select>
                                        <p className="text-xs text-gray-500 mt-1">
                                            Define qué opción aparecerá seleccionada por defecto al crear un egreso.
                                        </p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Consecutivo Inicial (Interno)</label>
                                        <input
                                            type="number"
                                            value={form.consecutiveSeed}
                                            onChange={e => handleChange('consecutiveSeed', parseInt(e.target.value) || 1)}
                                            min={1}
                                            className="w-full px-3 py-2 border rounded-lg"
                                        />
                                        <div className="flex items-center gap-2 mt-2 p-3 bg-blue-50 text-blue-700 rounded-lg text-xs">
                                            <Settings className="w-4 h-4" />
                                            <p>El siguiente comprobante INTERNO será <strong>CE-{form.consecutiveSeed}</strong></p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* TEAM TAB */}
                        {activeTab === 'team' && (
                            <div className="space-y-4">
                                <h3 className="text-lg font-medium text-gray-900 border-b pb-2 mb-4">Equipo de Gestión</h3>
                                <p className="text-sm text-gray-500 mb-4">Selecciona los responsables desde tu lista de proveedores.</p>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Administrador</label>
                                        <select
                                            value={form.adminId}
                                            onChange={e => handleChange('adminId', e.target.value)}
                                            className="w-full px-3 py-2 border rounded-lg"
                                        >
                                            <option value="">-- Seleccionar --</option>
                                            {providers.map(p => (
                                                <option key={p.id} value={p.id}>{p.name} ({p.nit})</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Contador</label>
                                        <select
                                            value={form.accountantId}
                                            onChange={e => handleChange('accountantId', e.target.value)}
                                            className="w-full px-3 py-2 border rounded-lg"
                                        >
                                            <option value="">-- Seleccionar --</option>
                                            {providers.map(p => (
                                                <option key={p.id} value={p.id}>{p.name} ({p.nit})</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Revisor Fiscal</label>
                                        <select
                                            value={form.fiscalRevisorId}
                                            onChange={e => handleChange('fiscalRevisorId', e.target.value)}
                                            className="w-full px-3 py-2 border rounded-lg"
                                        >
                                            <option value="">-- Seleccionar --</option>
                                            {providers.map(p => (
                                                <option key={p.id} value={p.id}>{p.name} ({p.nit})</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="pt-4">
                                        <a href="/providers" className="text-sm text-indigo-600 hover:underline flex items-center gap-1">
                                            <Plus className="w-3 h-3" /> Crear nuevo proveedor
                                        </a>
                                    </div>
                                </div>
                            </div>
                        )}

                    </form>
                </div>

                {/* Footer Actions */}
                <div className="flex items-center justify-end gap-3 p-4 border-t bg-gray-50">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isLoading}
                        className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 shadow-sm disabled:opacity-50 flex items-center gap-2 transition-colors"
                    >
                        {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                        {unit ? 'Guardar Cambios' : 'Crear Unidad'}
                    </button>
                </div>
            </div>
        </div>
    )
}
