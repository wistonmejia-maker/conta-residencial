import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { API_BASE } from '../lib/api/common'
import { useUnit } from '../lib/UnitContext'
import { Loader2, Plus, Brain, AlertCircle, FileUp, TrendingUp } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, AIButton } from '../components/ui'

export default function BudgetPage() {
    const { selectedUnit } = useUnit()
    const unitId = selectedUnit?.id || ''
    const queryClient = useQueryClient()

    const [month, setMonth] = useState(new Date().getMonth() + 1)
    const [year, setYear] = useState(new Date().getFullYear())
    const [isEditing, setIsEditing] = useState(false)

    // AI State
    const [analyzing, setAnalyzing] = useState(false)
    const [importing, setImporting] = useState(false)
    const [analysisResult, setAnalysisResult] = useState<{ alerts: string[], analysis: string, forecast: string } | null>(null)
    const [showAnalysisModal, setShowAnalysisModal] = useState(false)

    // Fetch Execution Data
    const { data: executionData, isLoading } = useQuery({
        queryKey: ['budget-execution', unitId, month, year],
        queryFn: async () => {
            const res = await fetch(`${API_BASE}/budgets/execution?unitId=${unitId}&month=${month}&year=${year}`)
            return res.json()
        },
        enabled: !!unitId
    })

    const comparison = executionData?.comparison || []

    // Temporary state for editing budget
    const [editItems, setEditItems] = useState<{ category: string, amount: number }[]>([])

    // Save Budget Mutation
    const saveBudgetMutation = useMutation({
        mutationFn: async (items: any[]) => {
            const res = await fetch(`${API_BASE}/budgets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ unitId, month, year, items })
            })
            return res.json()
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['budget-execution'] })
            setIsEditing(false)
        }
    })

    const handleOpenEdit = () => {
        // Initialize edit items with current categories or defaults
        const existing = comparison.map((c: any) => ({ category: c.category, amount: c.budgeted }))
        if (existing.length === 0) {
            setEditItems([{ category: 'Mantenimiento', amount: 0 }])
        } else {
            setEditItems(existing)
        }
        setIsEditing(true)
    }

    const handleAnalyze = async () => {
        setAnalyzing(true)
        setShowAnalysisModal(true)
        setAnalysisResult(null)
        try {
            const res = await fetch(`${API_BASE}/budgets/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ unitId, month, year })
            })
            const data = await res.json()
            setAnalysisResult(data)
        } catch (error) {
            console.error(error)
            // Fallback error state
            setAnalysisResult({ alerts: [], analysis: 'Error al conectar con la IA.', forecast: '' })
        } finally {
            setAnalyzing(false)
        }
    }

    const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setImporting(true)
        const formData = new FormData()
        formData.append('file', file)

        try {
            const res = await fetch(`${API_BASE}/budgets/import`, {
                method: 'POST',
                body: formData
            })
            const data = await res.json()
            if (data.items) {
                setEditItems(data.items)
                setIsEditing(true)
            } else {
                alert('No se pudieron extraer ítems.')
            }
        } catch (error) {
            console.error(error)
            alert('Error al importar.')
        } finally {
            setImporting(false)
            // Reset input
            e.target.value = ''
        }
    }

    if (!unitId) return <div>Selecciona una unidad</div>

    return (
        <div className="space-y-6 max-w-6xl mx-auto p-6 animate-fade-in">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Control Presupuestal</h1>
                    <p className="text-sm text-gray-500">Gestión y seguimiento de la ejecución de gastos mes a mes.</p>
                </div>

                <div className="flex items-center gap-2 bg-white p-2 rounded-lg shadow-sm border border-gray-200">
                    <select value={month} onChange={e => setMonth(Number(e.target.value))} className="input border-none bg-transparent font-medium">
                        {[...Array(12)].map((_, i) => <option key={i + 1} value={i + 1}>{new Date(2000, i, 1).toLocaleString('es-ES', { month: 'long' })}</option>)}
                    </select>
                    <select value={year} onChange={e => setYear(Number(e.target.value))} className="input border-none bg-transparent font-medium">
                        {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </div>
            </div>

            {/* Actions Bar */}
            <div className="flex justify-end gap-2">
                <div className="relative">
                    <input
                        type="file"
                        accept=".xlsx,.xls,.pdf,.jpg,.png"
                        onChange={handleImportFile}
                        className="absolute inset-0 w-full h-full cursor-pointer"
                        style={{ opacity: 0 }}
                        disabled={importing}
                    />
                    <button className="btn-secondary flex items-center gap-2 bg-white text-gray-700 border hover:bg-gray-50" disabled={importing}>
                        {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
                        Importar (Excel/PDF)
                    </button>
                </div>

                <button onClick={handleOpenEdit} className="btn-secondary flex items-center gap-2">
                    <Plus className="w-4 h-4" /> Definir Presupuesto
                </button>
                <AIButton
                    variant="primary"
                    loading={analyzing}
                    disabled={comparison.length === 0}
                    onClick={handleAnalyze}
                    icon={<Brain className="w-4 h-4" />}
                    title={comparison.length === 0 ? "Primero define un presupuesto" : "Analizar ejecución con IA"}
                >
                    {analyzing ? 'Analizando...' : 'Analizar con IA'}
                </AIButton>

            </div>

            {/* Comparison Table */}
            <div className="card bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {isLoading ? (
                    <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>
                ) : comparison.length === 0 ? (
                    <div className="p-12 text-center text-gray-500 flex flex-col items-center gap-2">
                        <AlertCircle className="w-8 h-8 text-gray-300" />
                        No hay datos de presupuesto ni ejecución para este periodo.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-200">
                                <tr>
                                    <th className="p-4">Categoría</th>
                                    <th className="p-4 text-right">Presupuesto</th>
                                    <th className="p-4 text-right">Ejecutado</th>
                                    <th className="p-4 text-right">Diferencia</th>
                                    <th className="p-4 w-1/3">Cumplimiento</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {comparison.map((item: any) => (
                                    <tr key={item.category} className="hover:bg-gray-50 transition-colors">
                                        <td className="p-4 font-medium text-gray-800">{item.category}</td>
                                        <td className="p-4 text-right">{Number(item.budgeted).toLocaleString('es-CO', { style: 'currency', currency: 'COP' })}</td>
                                        <td className="p-4 text-right">{Number(item.executed).toLocaleString('es-CO', { style: 'currency', currency: 'COP' })}</td>
                                        <td className={`p-4 text-right font-bold ${item.difference < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                            {Number(item.difference).toLocaleString('es-CO', { style: 'currency', currency: 'COP' })}
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full ${item.percent > 100 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                                                        style={{ width: `${Math.min(item.percent, 100)}%` }}
                                                    />
                                                </div>
                                                <span className="text-xs font-bold w-12 text-right">{Math.round(item.percent)}%</span>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Edit Modal */}
            <Dialog open={isEditing} onOpenChange={setIsEditing}>
                <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Definir Presupuesto - {month}/{year}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 mt-4">
                        {editItems.map((item, idx) => (
                            <div key={idx} className="flex gap-2">
                                <input
                                    placeholder="Categoría (ej: Seguridad)"
                                    className="input flex-1 border rounded px-2"
                                    value={item.category}
                                    onChange={e => {
                                        const newItems = [...editItems]
                                        newItems[idx].category = e.target.value
                                        setEditItems(newItems)
                                    }}
                                />
                                <input
                                    type="number"
                                    placeholder="Valor"
                                    className="input w-32 border rounded px-2"
                                    value={item.amount}
                                    onChange={e => {
                                        const newItems = [...editItems]
                                        newItems[idx].amount = Number(e.target.value)
                                        setEditItems(newItems)
                                    }}
                                />
                            </div>
                        ))}
                        <button
                            onClick={() => setEditItems([...editItems, { category: '', amount: 0 }])}
                            className="text-xs text-indigo-600 font-bold flex items-center gap-1 hover:underline"
                        >
                            <Plus className="w-3 h-3" /> Agregar Categoría
                        </button>

                        <div className="pt-4 flex justify-end gap-2">
                            <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-lg">Cancelar</button>
                            <button
                                onClick={() => saveBudgetMutation.mutate(editItems.filter(i => i.category && i.amount > 0))}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
                            >
                                {saveBudgetMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                                Guardar Presupuesto
                            </button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* AI Modal */}
            <Dialog open={showAnalysisModal} onOpenChange={setShowAnalysisModal}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-indigo-700">
                            <Brain className="w-6 h-6" />
                            Análisis de Ejecución Presupuestal
                        </DialogTitle>
                    </DialogHeader>
                    <div className="mt-4">
                        {analyzing ? (
                            <div className="flex flex-col items-center justify-center py-8 space-y-4">
                                <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
                                <p className="text-gray-500">Analizando desviaciones y cumplimiento...</p>
                            </div>
                        ) : analysisResult ? (
                            <div className="space-y-4">
                                {analysisResult.alerts && analysisResult.alerts.length > 0 && (
                                    <div className="bg-rose-50 border border-rose-100 p-4 rounded-lg">
                                        <h4 className="flex items-center gap-2 font-bold text-rose-700 mb-2">
                                            <AlertCircle className="w-5 h-5" /> Alertas Críticas
                                        </h4>
                                        <ul className="list-disc list-inside text-rose-800 text-sm space-y-1">
                                            {analysisResult.alerts.map((alert, i) => <li key={i}>{alert}</li>)}
                                        </ul>
                                    </div>
                                )}

                                <div className="bg-gray-50 border border-gray-100 p-4 rounded-lg">
                                    <h4 className="font-bold text-gray-800 mb-2">Análisis de Ejecución</h4>
                                    <div className="prose prose-sm text-gray-700 whitespace-pre-wrap">
                                        {analysisResult.analysis}
                                    </div>
                                </div>

                                {analysisResult.forecast && (
                                    <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg">
                                        <h4 className="flex items-center gap-2 font-bold text-blue-700 mb-2">
                                            <TrendingUp className="w-5 h-5" /> Proyección Cierre de Mes
                                        </h4>
                                        <p className="text-blue-800 text-sm">
                                            {analysisResult.forecast}
                                        </p>
                                    </div>
                                )}
                            </div>
                        ) : null}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
