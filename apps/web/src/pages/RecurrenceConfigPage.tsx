import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Plus, Trash2, Loader2, AlertTriangle, Check, Search, ChevronDown } from 'lucide-react'
import { useUnit } from '../lib/UnitContext'
import { getProviders, getProviderConfigs, upsertProviderConfig, deleteProviderConfig } from '../lib/api'
import type { Provider } from '../lib/api'

interface ProviderUnitConfig {
    id: string
    providerId: string
    unitId: string
    isRecurring: boolean
    category: string | null
    provider: {
        id: string
        name: string
        nit: string
    }
}

const categoryOptions = [
    { value: 'servicios_publicos', label: '⚡ Servicios Públicos', color: 'bg-yellow-100 text-yellow-800' },
    { value: 'seguridad', label: '🛡️ Seguridad', color: 'bg-blue-100 text-blue-800' },
    { value: 'aseo', label: '🧹 Aseo/Mantenimiento', color: 'bg-green-100 text-green-800' },
    { value: 'seguros', label: '📋 Seguros', color: 'bg-purple-100 text-purple-800' },
    { value: 'impuestos', label: '💰 Impuestos', color: 'bg-red-100 text-red-800' },
    { value: 'otro', label: '📦 Otro', color: 'bg-gray-100 text-gray-800' },
]

function SearchableSelect({
    options,
    value,
    onChange,
    placeholder = "Seleccionar..."
}: {
    options: { value: string; label: string }[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}) {
    const [isOpen, setIsOpen] = useState(false)
    const [search, setSearch] = useState('')
    const selectedOption = options.find(o => o.value === value)

    const filteredOptions = options.filter(o =>
        o.label.toLowerCase().includes(search.toLowerCase())
    )

    return (
        <div className="relative">
            <div
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white cursor-pointer flex items-center justify-between hover:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-500"
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className={selectedOption ? 'text-gray-900' : 'text-gray-500'}>
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
                <ChevronDown className="w-4 h-4 text-gray-400" />
            </div>

            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-60 overflow-hidden flex flex-col">
                    <div className="p-2 border-b border-gray-100 sticky top-0 bg-white">
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-2 top-2.5 text-gray-400" />
                            <input
                                type="text"
                                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:border-indigo-500 outline-none"
                                placeholder="Buscar..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                autoFocus
                            />
                        </div>
                    </div>
                    <div className="overflow-y-auto flex-1">
                        {filteredOptions.length === 0 ? (
                            <div className="px-3 py-2 text-sm text-gray-500 text-center">No se encontraron resultados</div>
                        ) : (
                            filteredOptions.map(option => (
                                <div
                                    key={option.value}
                                    className={`px-3 py-2 text-sm cursor-pointer hover:bg-indigo-50 flex items-center justify-between ${option.value === value ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700'}`}
                                    onClick={() => {
                                        onChange(option.value)
                                        setIsOpen(false)
                                        setSearch('')
                                    }}
                                >
                                    <span>{option.label}</span>
                                    {option.value === value && <Check className="w-3.5 h-3.5" />}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* Overlay to close when clicking outside */}
            {isOpen && (
                <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            )}
        </div>
    )
}

export default function RecurrenceConfigPage() {
    const { selectedUnit } = useUnit()
    const unitId = selectedUnit?.id || ''
    const queryClient = useQueryClient()

    const [showAddModal, setShowAddModal] = useState(false)

    // Get existing configs for this unit
    const { data: configsData, isLoading: configsLoading } = useQuery({
        queryKey: ['provider-configs', unitId],
        queryFn: () => getProviderConfigs(unitId),
        enabled: !!unitId
    })

    const configs = configsData?.configs || []
    const recurringConfigs = configs.filter((c: any) => c.isRecurring)

    // Get all providers for adding new configs
    const { data: providersData } = useQuery({
        queryKey: ['providers'],
        queryFn: () => getProviders() // Fix: invoke getProviders
    })

    const allProviders: Provider[] = providersData?.providers || []

    // Providers that don't have a recurring config for this unit
    const availableProviders = allProviders.filter(
        p => !recurringConfigs.some((c: any) => c.providerId === p.id)
    )

    const updateMutation = useMutation({
        mutationFn: upsertProviderConfig,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['provider-configs'] })
        }
    })

    const deleteMutation = useMutation({
        mutationFn: deleteProviderConfig,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['provider-configs'] })
        }
    })

    const handleRemove = (config: ProviderUnitConfig) => {
        if (confirm(`¿Quitar "${config.provider.name}" de los proveedores recurrentes?`)) {
            deleteMutation.mutate(config.id)
        }
    }

    const handleCategoryChange = (config: ProviderUnitConfig, category: string) => {
        updateMutation.mutate({
            providerId: config.providerId,
            unitId: config.unitId,
            isRecurring: true,
            category
        })
    }

    if (!unitId) {
        return (
            <div className="p-8 text-center text-gray-500">
                Selecciona una unidad para configurar proveedores recurrentes
            </div>
        )
    }

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Proveedores Recurrentes</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Configura qué proveedores deben facturar cada mes para <span className="font-medium text-indigo-600">{selectedUnit?.name}</span>
                    </p>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="px-4 py-2 bg-brand-primary text-white rounded-button text-sm font-medium hover:bg-brand-700 shadow-sm flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    Agregar Proveedor
                </button>
            </div>

            {/* Info Banner */}
            <div className="card p-4 bg-amber-50 border-amber-200 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800">
                    <p className="font-medium">¿Cómo funcionan las alertas?</p>
                    <p className="mt-1">
                        Si un proveedor marcado como recurrente no tiene una factura registrada en el mes actual,
                        aparecerá una alerta en el Dashboard para recordarte registrarla.
                    </p>
                </div>
            </div>

            {/* Recurring Providers List */}
            {configsLoading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                </div>
            ) : recurringConfigs.length === 0 ? (
                <div className="card p-12 text-center">
                    <RefreshCw className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No hay proveedores recurrentes</h3>
                    <p className="text-gray-500 mb-4">
                        Agrega proveedores que deben facturar mensualmente para recibir alertas.
                    </p>
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="px-4 py-2 bg-brand-primary text-white rounded-button text-sm font-medium hover:bg-brand-700"
                    >
                        Agregar Primer Proveedor
                    </button>
                </div>
            ) : (
                <div className="card overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-100">
                            <tr>
                                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Proveedor</th>
                                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">NIT</th>
                                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Categoría</th>
                                <th className="text-center px-4 py-3 text-sm font-medium text-gray-600 w-20">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {recurringConfigs.map((c: any) => (
                                <tr key={c.id} className="hover:bg-gray-50/50">
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <RefreshCw className="w-4 h-4 text-indigo-500" />
                                            <span className="font-medium text-gray-900">{c.provider.name}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                                        {c.provider.nit}
                                    </td>
                                    <td className="px-4 py-3">
                                        <select
                                            value={c.category || ''}
                                            onChange={(e) => handleCategoryChange(c, e.target.value)}
                                            className={`px-2 py-1 text-xs font-medium rounded-lg border-0 cursor-pointer ${categoryOptions.find(o => o.value === c.category)?.color || 'bg-gray-100 text-gray-600'
                                                }`}
                                        >
                                            <option value="">Sin categoría</option>
                                            {categoryOptions.map((cat: { value: string; label: string }) => (
                                                <option key={cat.value} value={cat.value}>
                                                    {cat.label}
                                                </option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <button
                                            onClick={() => handleRemove(c)}
                                            disabled={deleteMutation.isPending}
                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                                            title="Quitar de recurrentes"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Add Provider Modal */}
            {showAddModal && (
                <AddRecurringModal
                    unitId={unitId}
                    availableProviders={availableProviders}
                    onClose={() => setShowAddModal(false)}
                    onSuccess={() => {
                        setShowAddModal(false)
                        queryClient.invalidateQueries({ queryKey: ['provider-configs'] })
                    }}
                />
            )}
        </div>
    )
}

// Modal to add a provider as recurring
function AddRecurringModal({
    unitId,
    availableProviders,
    onClose,
    onSuccess
}: {
    unitId: string
    availableProviders: Provider[]
    onClose: () => void
    onSuccess: () => void
}) {
    const [selectedProvider, setSelectedProvider] = useState('')
    const [selectedCategory, setSelectedCategory] = useState('')
    const [isLoading, setIsLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedProvider) {
            alert('Selecciona un proveedor')
            return
        }

        setIsLoading(true)
        try {
            await upsertProviderConfig({
                providerId: selectedProvider,
                unitId,
                isRecurring: true,
                category: selectedCategory || undefined
            })
            onSuccess()
        } catch (error) {
            console.error('Error adding recurring provider:', error)
            alert('Error al agregar proveedor')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
                <div className="flex items-center justify-between p-4 border-b">
                    <h2 className="text-lg font-semibold text-gray-900">Agregar Proveedor Recurrente</h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
                        <span className="text-gray-500 text-xl">×</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Proveedor *
                        </label>
                        {availableProviders.length === 0 ? (
                            <p className="text-sm text-gray-500 italic">
                                Todos los proveedores ya están configurados como recurrentes
                            </p>
                        ) : (
                            <SearchableSelect
                                options={availableProviders.map(p => ({
                                    value: p.id,
                                    label: `${p.name} (${p.nit})`
                                }))}
                                value={selectedProvider}
                                onChange={setSelectedProvider}
                                placeholder="Selecciona un proveedor..."
                            />
                        )}
                    </div>


                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Categoría
                        </label>
                        <select
                            value={selectedCategory}
                            onChange={e => setSelectedCategory(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="">Sin categoría</option>
                            {categoryOptions.map(cat => (
                                <option key={cat.value} value={cat.value}>
                                    {cat.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg text-sm font-medium"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading || !selectedProvider}
                            className="px-4 py-2 bg-brand-primary text-white rounded-button text-sm font-medium hover:bg-brand-700 disabled:opacity-50 flex items-center gap-2"
                        >
                            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                            <Check className="w-4 h-4" />
                            Agregar
                        </button>
                    </div>
                </form >
            </div >
        </div >
    )
}
