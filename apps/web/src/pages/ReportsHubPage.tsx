import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
    BarChart3,
    Download,
    PieChart,
    TrendingUp,
    Users,
    Calendar,
    Loader2,
    Database,
    Filter,
    Search,
    ChevronDown,
    AlertCircle,
    FileText,
    Calculator,
    CheckCircle2
} from 'lucide-react'
import { useUnit } from '../lib/UnitContext'
import { getInvoices, getPayments, getProviders, getUnits, analyzeReport } from '../lib/api'
import * as XLSX from 'xlsx'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, AIButton } from '../components/ui'
import { Brain } from 'lucide-react'

// Helper for dates
const getMonthRange = (monthsAgo = 0) => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1)
    const end = new Date(now.getFullYear(), now.getMonth() - monthsAgo + 1, 0)
    return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0]
    }
}

export default function ReportsHubPage() {
    const { selectedUnit } = useUnit()
    const unitId = selectedUnit?.id || ''

    const currentMonth = getMonthRange(0)
    const [dateFrom, setDateFrom] = useState(currentMonth.start)
    const [dateTo, setDateTo] = useState(currentMonth.end)
    const [selectedProviderId, setSelectedProviderId] = useState('')

    const [exportingPBI, setExportingPBI] = useState(false)
    const [exportingAux, setExportingAux] = useState(false)
    const [exportingExec, setExportingExec] = useState(false)

    // AI Analysis State
    const [analyzing, setAnalyzing] = useState(false)
    const [analysisResult, setAnalysisResult] = useState<string | null>(null)
    const [analysisTitle, setAnalysisTitle] = useState('')
    const [showAnalysisModal, setShowAnalysisModal] = useState(false)

    // Fetch providers for the filter
    const { data: providersData } = useQuery({
        queryKey: ['providers'],
        queryFn: () => getProviders()
    })
    const providers = providersData?.providers || []

    // AI Helpers
    const fetchAuxiliarData = async () => {
        if (!selectedProviderId) return null
        const [invoicesRes, paymentsRes] = await Promise.all([
            getInvoices({ unitId, providerId: selectedProviderId }),
            getPayments({ unitId })
        ])
        const invoices = invoicesRes.invoices || []

        const providerPayments = (paymentsRes.payments || []).filter((p: any) => p.provider?.id === selectedProviderId)

        return [
            ...invoices.map((inv: any) => ({
                fecha: inv.invoiceDate, type: 'Factura', ref: inv.invoiceNumber, desc: inv.description, credit: inv.totalAmount, debit: 0
            })),
            ...providerPayments.map((p: any) => ({
                fecha: p.paymentDate, type: 'Egreso', ref: p.consecutiveNumber, desc: `Pago ${p.transactionRef}`, credit: 0, debit: p.amountPaid
            }))
        ]
    }

    const fetchExecutionData = async () => {
        const [paymentsRes] = await Promise.all([getPayments({ unitId })])
        const allPayments = paymentsRes.payments || []
        const from = new Date(dateFrom + 'T00:00:00')
        const to = new Date(dateTo + 'T23:59:59')

        return allPayments.filter((p: any) => {
            const pDate = new Date(p.paymentDate)
            return pDate >= from && pDate <= to
        }).map((p: any) => ({
            fecha: p.paymentDate.split('T')[0],
            proveedor: p.provider?.name,
            categoria: p.provider?.category || 'Sin Categoría',
            valor: p.amountPaid
        }))
    }

    const handleAnalyze = async (reportId: string, title: string) => {
        setAnalyzing(true)
        setAnalysisTitle(title)
        setShowAnalysisModal(true)
        setAnalysisResult(null)

        try {
            let data: any[] = []

            if (reportId === 'aux') data = await fetchAuxiliarData() || []
            else if (reportId === 'exec') data = await fetchExecutionData()
            else if (reportId === 'ap') {
                // Quick fetch for purpose of demo
                const [invRes] = await Promise.all([getInvoices({ unitId })])
                data = (invRes.invoices || []).filter((i: any) => i.balance > 0).map((i: any) => ({
                    proveedor: i.provider?.name,
                    factura: i.invoiceNumber,
                    saldo: i.balance,
                    dias_vencido: Math.floor((Date.now() - new Date(i.dueDate).getTime()) / (1000 * 60 * 60 * 24))
                }))
            }

            if (!data || data.length === 0) {
                setAnalysisResult('No hay datos suficientes para analizar en este periodo/selección.')
            } else {
                const res = await analyzeReport(title, data)
                setAnalysisResult(res.analysis)
            }
        } catch (error) {
            console.error(error)
            setAnalysisResult('Error al generar el análisis. Intente nuevamente.')
        } finally {
            setAnalyzing(false)
        }
    }

    const handleAuxiliarExport = async () => {
        if (!selectedProviderId) {
            alert('Por favor selecciona un proveedor primero')
            return
        }

        setExportingAux(true)
        try {
            const provider = providers.find((p: any) => p.id === selectedProviderId)
            const [invoicesRes, paymentsRes] = await Promise.all([
                getInvoices({ unitId, providerId: selectedProviderId }),
                getPayments({ unitId }) // Filtered by provider in frontend for payments
            ])

            const invoices = invoicesRes.invoices || []
            const providerPayments = (paymentsRes.payments || []).filter((p: any) => p.provider?.id === selectedProviderId)

            // Combine and sort by date
            const entries: any[] = [
                ...invoices.map((inv: any) => ({
                    date: new Date(inv.invoiceDate),
                    type: 'Factura',
                    ref: inv.invoiceNumber,
                    description: inv.description || 'Carga de factura',
                    credit: Number(inv.totalAmount),
                    debit: 0
                })),
                ...providerPayments.map((p: any) => ({
                    date: new Date(p.paymentDate),
                    type: 'Egreso',
                    ref: p.consecutiveNumber ? `CE-${p.consecutiveNumber}` : (p.manualConsecutive || 'EXT'),
                    description: `Pago ${p.bankPaymentMethod || ''} ${p.transactionRef || ''}`,
                    credit: 0,
                    debit: Number(p.amountPaid)
                }))
            ].sort((a, b) => a.date.getTime() - b.date.getTime())

            let runningBalance = 0
            const finalData = entries.map(e => {
                runningBalance += (e.credit - e.debit)
                return {
                    'Fecha': e.date.toISOString().split('T')[0],
                    'Tipo': e.type,
                    'Referencia': e.ref,
                    'Descripción': e.description,
                    'Crédito (+ Deuda)': e.credit,
                    'Débito (- Pago)': e.debit,
                    'Saldo': runningBalance
                }
            })

            const wb = XLSX.utils.book_new()
            const ws = XLSX.utils.json_to_sheet(finalData)
            XLSX.utils.book_append_sheet(wb, ws, 'Auxiliar')
            XLSX.writeFile(wb, `Auxiliar_${provider.name.replace(/ /g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`)

        } catch (error) {
            console.error('Error exporting Auxiliar:', error)
            alert('Error al generar reporte auxiliar')
        } finally {
            setExportingAux(false)
        }
    }

    const handleExecutionExport = async () => {
        setExportingExec(true)
        try {
            const [paymentsRes] = await Promise.all([
                getPayments({ unitId })
            ])

            const allPayments = paymentsRes.payments || []

            // Filter by date range
            const from = new Date(dateFrom + 'T00:00:00')
            const to = new Date(dateTo + 'T23:59:59')
            const rangePayments = allPayments.filter((p: any) => {
                const pDate = new Date(p.paymentDate)
                return pDate >= from && pDate <= to
            })

            // Group by category
            const categoriesMap: Record<string, { total: number, count: number }> = {}

            rangePayments.forEach((p: any) => {
                const category = p.provider?.category || 'Sin Categoría'
                if (!categoriesMap[category]) {
                    categoriesMap[category] = { total: 0, count: 0 }
                }
                categoriesMap[category].total += Number(p.amountPaid)
                categoriesMap[category].count += 1
            })

            const summaryData = Object.entries(categoriesMap).map(([cat, stats]) => ({
                'Categoría': cat,
                'Nro Pagos': stats.count,
                'Total Pagado': stats.total
            })).sort((a, b) => b['Total Pagado'] - a['Total Pagado'])

            const wb = XLSX.utils.book_new()

            // Sheet 1: Summary
            const wsSummary = XLSX.utils.json_to_sheet(summaryData)
            XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen por Categoría')

            // Sheet 2: Detail
            const detailedData = rangePayments.map((p: any) => ({
                'Fecha': p.paymentDate.split('T')[0],
                'Proveedor': p.provider?.name || 'N/A',
                'Categoría': p.provider?.category || 'Sin Categoría',
                'Valor': Number(p.amountPaid),
                'CE': p.consecutiveNumber ? `CE-${p.consecutiveNumber}` : (p.manualConsecutive || 'EXT')
            }))
            const wsDetail = XLSX.utils.json_to_sheet(detailedData)
            XLSX.utils.book_append_sheet(wb, wsDetail, 'Detalle de Pagos')

            XLSX.writeFile(wb, `Ejecucion_Categorias_${dateFrom}_a_${dateTo}.xlsx`)

        } catch (error) {
            console.error('Error exporting Execution:', error)
            alert('Error al generar reporte de ejecución')
        } finally {
            setExportingExec(false)
        }
    }

    const handleAPSummaryExport = async () => {
        setExportingPBI(true) // Reuse general loading or add new
        try {
            const [invoicesRes, providersRes] = await Promise.all([
                getInvoices({ unitId }),
                getProviders()
            ])

            const invoices = invoicesRes.invoices || []
            const provs = providersRes.providers || []

            const summary = provs.map((p: any) => {
                const provInvoices = invoices.filter((inv: any) => inv.providerId === p.id)
                const totalDebt = provInvoices.reduce((sum: number, inv: any) => sum + Number(inv.balance || 0), 0)
                const totalInvoiced = provInvoices.reduce((sum: number, inv: any) => sum + Number(inv.totalAmount || 0), 0)

                return {
                    'Proveedor': p.name,
                    'NIT': p.nit,
                    'Categoría': p.category || p.recurringCategory || 'N/A',
                    'Total Facturado': totalInvoiced,
                    'Saldo Pendiente': totalDebt,
                    'Estado': totalDebt > 0 ? 'Con Pendientes' : 'Al Día'
                }
            }).filter((s: any) => s['Total Facturado'] > 0 || s['Saldo Pendiente'] > 0)

            const wb = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Cuentas por Pagar')
            XLSX.writeFile(wb, `Resumen_Cuentas_Por_Pagar_${new Date().toISOString().split('T')[0]}.xlsx`)

        } catch (error) {
            console.error('Error exporting AP Summary:', error)
        } finally {
            setExportingPBI(false)
        }
    }

    const handleWithholdingExport = async () => {
        setExportingPBI(true)
        try {
            const [paymentsRes] = await Promise.all([
                getPayments({ unitId })
            ])

            const allPayments = paymentsRes.payments || []

            // Filter by date range
            const from = new Date(dateFrom + 'T00:00:00')
            const to = new Date(dateTo + 'T23:59:59')
            const rangePayments = allPayments.filter((p: any) => {
                const pDate = new Date(p.paymentDate)
                return pDate >= from && pDate <= to
            })

            // Group by provider
            const holdingsMap: Record<string, { name: string, nit: string, rf: number, ri: number, total: number }> = {}

            rangePayments.forEach((p: any) => {
                const pid = p.provider?.id
                if (!pid) return

                if (!holdingsMap[pid]) {
                    holdingsMap[pid] = {
                        name: p.provider?.name || 'N/A',
                        nit: p.provider?.nit || 'N/A',
                        rf: 0,
                        ri: 0,
                        total: 0
                    }
                }
                holdingsMap[pid].rf += Number(p.retefuenteApplied || 0)
                holdingsMap[pid].ri += Number(p.reteicaApplied || 0)
                holdingsMap[pid].total += Number(p.amountPaid || 0)
            })

            const summaryData = Object.values(holdingsMap).map(h => ({
                'Proveedor': h.name,
                'NIT': h.nit,
                'Base/Bruto': h.total,
                'ReteFuente': h.rf,
                'ReteICA': h.ri,
                'Total Retenido': h.rf + h.ri
            })).filter(h => h['Total Retenido'] > 0)

            const wb = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), 'Retenciones')
            XLSX.writeFile(wb, `Reporte_Retenciones_${dateFrom}_a_${dateTo}.xlsx`)

        } catch (error) {
            console.error('Error exporting Withholding:', error)
        } finally {
            setExportingPBI(false)
        }
    }

    const handlePowerBIExport = async () => {
        setExportingPBI(true)
        try {
            // Fetch ALL data
            const [invoicesRes, paymentsRes, providersRes, unitsRes] = await Promise.all([
                getInvoices(),
                getPayments(),
                getProviders(),
                getUnits()
            ])

            const invoices = invoicesRes.invoices || []
            const payments = paymentsRes.payments || []
            const providersList = providersRes.providers || []
            const unitsList = unitsRes.units || unitsRes || []

            const wb = XLSX.utils.book_new()

            // 1. Invoices Table
            const invoicesData = invoices.map((inv: any) => ({
                'ID_Factura': inv.id,
                'ID_Unidad': inv.unitId,
                'Unidad': unitsList.find((u: any) => u.id === inv.unitId)?.name || 'N/A',
                'ID_Proveedor': inv.providerId,
                'Proveedor': inv.provider?.name || 'N/A',
                'NIT': inv.provider?.nit || 'N/A',
                'Numero_Factura': inv.invoiceNumber,
                'Fecha': inv.invoiceDate ? new Date(inv.invoiceDate).toISOString().split('T')[0] : '',
                'Vencimiento': inv.dueDate ? new Date(inv.dueDate).toISOString().split('T')[0] : '',
                'Subtotal': Number(inv.subtotal || 0),
                'IVA': Number(inv.taxIva || 0),
                'Total': Number(inv.totalAmount || 0),
                'Saldo': Number(inv.balance || 0),
                'Pagado': Number(inv.paidAmount || 0),
                'Estado': inv.status,
                'Descripcion': inv.description || ''
            }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(invoicesData), 'Facturas')

            // 2. Payments Table
            const paymentsData = payments.map((p: any) => ({
                'ID_Pago': p.id,
                'ID_Unidad': p.unitId,
                'Unidad': unitsList.find((u: any) => u.id === p.unitId)?.name || 'N/A',
                'Consecutivo_CE': p.consecutiveNumber ? `CE-${p.consecutiveNumber}` : (p.manualConsecutive || 'EXT'),
                'Fecha': p.paymentDate ? new Date(p.paymentDate).toISOString().split('T')[0] : '',
                'ID_Proveedor': p.providerId,
                'Proveedor': p.provider?.name || 'N/A',
                'Metodo': p.bankPaymentMethod || '',
                'Referencia': p.transactionRef || '',
                'Valor_Bruto': Number(p.amountPaid || 0),
                'ReteFuente': Number(p.retefuenteApplied || 0),
                'ReteICA': Number(p.reteicaApplied || 0),
                'Valor_Neto': Number(p.netValue || 0),
                'Estado': p.status
            }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(paymentsData), 'Pagos')

            // 3. Providers Table
            const providersDataList = providersList.map((prov: any) => ({
                'ID_Proveedor': prov.id,
                'Nombre': prov.name,
                'NIT': prov.nit,
                'Email': prov.email || '',
                'Telefono': prov.phone || '',
                'Direccion': prov.address || '',
                'Ciudad': prov.city || '',
                'Categoria': prov.category || prov.recurringCategory || '',
                'Estado': prov.status,
                'Fecha_Creacion': prov.createdAt ? new Date(prov.createdAt).toISOString().split('T')[0] : ''
            }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(providersDataList), 'Proveedores')

            // 4. Units Table
            const unitsData = unitsList.map((u: any) => ({
                'ID_Unidad': u.id,
                'Nombre': u.name,
                'NIT_Unidad': u.taxId || '',
                'Direccion': u.address || ''
            }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(unitsData), 'Unidades')

            // 5. Payment Details (Linking table)
            // This requires payment items which are nested in some views or need a specific fetch
            // For now, let's include what we have.

            const fileName = `Export_Master_PowerBI_${new Date().toISOString().split('T')[0]}.xlsx`
            XLSX.writeFile(wb, fileName)

        } catch (error) {
            console.error('Error exporting Power BI data:', error)
            alert('Error al exportar datos para Power BI')
        } finally {
            setExportingPBI(false)
        }
    }

    const predesignedReports = [
        {
            id: 'pbi',
            title: 'Master Export Power BI',
            description: 'Exportación completa de facturas, pagos y proveedores en formato tabular para análisis avanzado.',
            icon: Database,
            color: 'bg-yellow-100 text-yellow-700',
            action: handlePowerBIExport,
            loading: exportingPBI
        },
        {
            id: 'aux',
            title: 'Estado de Cuenta por Proveedor',
            description: 'Historial detallado (débito/crédito) y saldo pendiente para un proveedor específico.',
            icon: Users,
            color: 'bg-blue-100 text-blue-700',
            action: handleAuxiliarExport,
            loading: exportingAux,
            requiresProvider: true
        },
        {
            id: 'ap',
            title: 'Resumen de Cuentas por Pagar',
            description: 'Listado de todos los proveedores con su saldo pendiente actual y total facturado.',
            icon: Calculator,
            color: 'bg-purple-100 text-purple-700',
            action: handleAPSummaryExport,
            loading: exportingPBI
        },
        {
            id: 'tax',
            title: 'Reporte de Retenciones e Impuestos',
            description: 'Consolidado de todas las retenciones practicadas (RF, ICA) por tercero en el periodo.',
            icon: FileText,
            color: 'bg-orange-100 text-orange-700',
            action: handleWithholdingExport,
            loading: exportingPBI,
            requiresDate: true
        },
        {
            id: 'aging',
            title: 'Cartera por Vencimiento',
            description: 'Análisis de facturas pendientes clasificadas por antigüedad (30, 60, 90+ días).',
            icon: Calendar,
            color: 'bg-rose-100 text-rose-700',
            comingSoon: true
        },
        {
            id: 'exec',
            title: 'Análisis de Gasto por Categoría',
            description: 'Resumen consolidado de egresos agrupados por categorías operativas del periodo.',
            icon: TrendingUp,
            color: 'bg-emerald-100 text-emerald-700',
            action: handleExecutionExport,
            loading: exportingExec,
            requiresDate: true
        },
    ]

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Centro de Reportes</h1>
                    <p className="text-sm text-gray-500 mt-1">Reportes especializados y exportación de datos para inteligencia de negocios</p>
                </div>
                <div className="p-2 bg-indigo-50 rounded-lg">
                    <PieChart className="w-6 h-6 text-indigo-600" />
                </div>
            </div>

            <div className="card p-6 bg-indigo-50 border-indigo-100 shadow-sm border-2">
                <div className="flex items-center gap-2 mb-4 text-indigo-700">
                    <Filter className="w-5 h-5" />
                    <h2 className="font-bold text-indigo-900">Configuración de Reportes Especializados</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-indigo-600 uppercase tracking-wider mb-2">1. Seleccionar Proveedor (Para Auxiliar)</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
                            <select
                                value={selectedProviderId}
                                onChange={(e) => setSelectedProviderId(e.target.value)}
                                className="input pl-10 h-11 text-sm border-indigo-200 focus:border-indigo-500 focus:ring-indigo-500 appearance-none bg-white font-medium shadow-sm transition-all"
                            >
                                <option value="">🔍 Buscar o elegir proveedor...</option>
                                {providers.map((p: any) => (
                                    <option key={p.id} value={p.id}>{p.name} ({p.nit})</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400 pointer-events-none" />
                        </div>
                        {selectedProviderId ? (
                            <p className="mt-2 text-xs text-indigo-600 flex items-center gap-1 font-semibold">
                                <CheckCircle2 className="w-3 h-3" /> Proveedor: {providers.find((p: any) => p.id === selectedProviderId)?.name}
                            </p>
                        ) : (
                            <p className="mt-2 text-xs text-rose-500 flex items-center gap-1 font-medium animate-pulse">
                                <AlertCircle className="w-3 h-3" /> Requerido para el reporte Auxiliar
                            </p>
                        )}
                    </div>

                    <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-indigo-600 uppercase tracking-wider mb-2">2. Definir Periodo (Para Gasto y Retenciones)</label>
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
                                <input
                                    type="date"
                                    value={dateFrom}
                                    onChange={(e) => setDateFrom(e.target.value)}
                                    className="input pl-10 h-11 text-sm border-indigo-200 focus:border-indigo-500 bg-white shadow-sm"
                                />
                            </div>
                            <span className="text-indigo-300 font-bold">al</span>
                            <div className="relative flex-1">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
                                <input
                                    type="date"
                                    value={dateTo}
                                    onChange={(e) => setDateTo(e.target.value)}
                                    className="input pl-10 h-11 text-sm border-indigo-200 focus:border-indigo-500 bg-white shadow-sm"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
                {predesignedReports.map((report) => (
                    <div key={report.id} className="card p-6 flex flex-col justify-between hover:shadow-md transition-all group border-gray-100">
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <div className={`p-3 rounded-xl ${report.color}`}>
                                    <report.icon className="w-6 h-6" strokeWidth={1.5} />
                                </div>
                                {report.comingSoon && (
                                    <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 bg-gray-100 text-gray-500 rounded-full">Próximamente</span>
                                )}
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 mb-2">{report.title}</h3>
                            <p className="text-sm text-gray-500 leading-relaxed mb-6">
                                {report.description}
                            </p>
                        </div>

                        <button
                            onClick={report.action}
                            disabled={report.comingSoon || report.loading || (report.requiresProvider && !selectedProviderId)}
                            className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-semibold transition-all ${report.comingSoon
                                ? 'bg-gray-50 text-gray-400 cursor-not-allowed'
                                : (report.requiresProvider && !selectedProviderId)
                                    ? 'bg-indigo-50 text-indigo-300 cursor-not-allowed'
                                    : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
                                }`}
                        >
                            {report.loading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Generando...
                                </>
                            ) : (
                                <>
                                    {report.comingSoon ? <AlertCircle className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                                    {report.comingSoon ? 'En Desarrollo' : (report.requiresProvider && !selectedProviderId ? 'Falta elegir proveedor' : `Descargar ${report.title}`)}
                                </>
                            )}
                        </button>

                        {/* AI Button */}
                        {!report.comingSoon && (
                            <AIButton
                                variant="secondary"
                                loading={analyzing}
                                disabled={report.requiresProvider && !selectedProviderId}
                                onClick={() => handleAnalyze(report.id, report.title)}
                                icon={<Brain className="w-4 h-4" />}
                                className="w-full mt-2"
                            >
                                {analyzing ? 'Analizando...' : 'Analizar con IA'}
                            </AIButton>
                        )}


                    </div>
                ))}
            </div>

            <Dialog open={showAnalysisModal} onOpenChange={setShowAnalysisModal}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-indigo-700">
                            <Brain className="w-6 h-6" />
                            Análisis Inteligente: {analysisTitle}
                        </DialogTitle>
                        <DialogDescription>
                            Interpretación automática generada por Gemini AI basada en los datos actuales.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="mt-4">
                        {analyzing ? (
                            <div className="flex flex-col items-center justify-center py-12 space-y-4">
                                <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
                                <div className="text-center">
                                    <p className="font-semibold text-gray-700">Analizando datos...</p>
                                    <p className="text-sm text-gray-500">Buscando patrones y anomalías</p>
                                </div>
                            </div>
                        ) : (
                            <div className="prose prose-indigo prose-sm w-full max-w-none bg-gray-50 p-6 rounded-xl border border-gray-100">
                                <div className="whitespace-pre-wrap font-medium text-gray-700">
                                    {analysisResult}
                                </div>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            <div className="card p-8 bg-indigo-900 text-white overflow-hidden relative">
                <div className="relative z-10 max-w-lg">
                    <h2 className="text-xl font-bold mb-2">¿Necesitas un reporte a medida?</h2>
                    <p className="text-indigo-100 text-sm mb-6">
                        Podemos construir visualizaciones personalizadas basadas en tus necesidades específicas de administración.
                    </p>
                    <button className="px-4 py-2 bg-white text-indigo-900 rounded-lg text-sm font-bold hover:bg-indigo-50 transition-colors">
                        Contactar Soporte
                    </button>
                </div>
                <div className="absolute right-[-20px] bottom-[-20px] opacity-10">
                    <BarChart3 className="w-64 h-64" />
                </div>
            </div>
        </div >
    )
}
