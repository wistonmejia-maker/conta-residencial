import { TrendingUp, TrendingDown, FileWarning, Wallet, ArrowRight, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getMissingRecurringInvoices, getInvoiceStats, getPayments } from '../lib/api'
import { useUnit } from '../lib/UnitContext'
import type { Payment } from '../lib/api'


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
    COMPLETED: 'Pagado',
    CONCILIATED: 'Conciliado',
}

export default function DashboardPage() {
    const { selectedUnit } = useUnit()
    const unitId = selectedUnit?.id || ''

    // Fetch invoice stats
    const { data: invoiceStats = { pending: { count: 0, total: 0 }, paid: { count: 0, total: 0 }, partiallyPaid: { count: 0, total: 0 } } } = useQuery({
        queryKey: ['invoice-stats', unitId],
        queryFn: () => getInvoiceStats(unitId),
        enabled: !!unitId
    })

    // Fetch payments
    const { data: paymentsData, isLoading: paymentsLoading } = useQuery({
        queryKey: ['payments', unitId],
        queryFn: () => getPayments({ unitId }),
        enabled: !!unitId
    })

    const payments: (Payment & { provider?: { name: string } })[] = paymentsData?.payments || []

    // Get recent payments (last 5)
    const recentPayments = payments
        .sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime())
        .slice(0, 5)

    // Calculate totals for current month
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthPayments = payments.filter(p => new Date(p.paymentDate) >= monthStart)
    const monthlyEgresos = monthPayments.reduce((sum, p) => sum + Number(p.netValue), 0)
    const pendingConciliation = payments.filter(p => p.status !== 'CONCILIATED').reduce((sum, p) => sum + Number(p.netValue), 0)

    // Fetch missing recurring invoices
    const { data: alertsData } = useQuery({
        queryKey: ['missing-invoices', unitId],
        queryFn: () => getMissingRecurringInvoices(unitId),
        enabled: !!unitId
    })

    const missingInvoices = alertsData?.providers || []
    const hasMissingInvoices = missingInvoices.length > 0

    // Dynamic stats
    const stats = [
        { label: 'Disponible en Banco', value: formatMoney(0), change: 'Conciliar para actualizar', positive: true, icon: Wallet },
        { label: 'Cuentas por Pagar', value: formatMoney(invoiceStats.pending?.total || 0), change: `${invoiceStats.pending?.count || 0} facturas`, positive: false, icon: FileWarning },
        { label: 'Egresos del Mes', value: formatMoney(monthlyEgresos), change: `${monthPayments.length} pagos`, positive: true, icon: TrendingDown },
        { label: 'Pendiente Conciliar', value: formatMoney(pendingConciliation), change: `${payments.filter(p => p.status !== 'CONCILIATED').length} movimientos`, positive: false, icon: TrendingUp },
    ]

    const currentMonth = now.toLocaleString('es-CO', { month: 'long', year: 'numeric' })

    // Loading state when no unit selected
    if (!unitId) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                <Wallet className="w-12 h-12 mb-4 text-gray-300" />
                <p className="text-lg font-medium">No hay unidad seleccionada</p>
                <p className="text-sm">Ve a <Link to="/units" className="text-indigo-600 underline">Unidades</Link> para crear una.</p>
            </div>
        )
    }

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
                    <p className="text-sm text-gray-500 mt-1">Resumen financiero de {currentMonth}</p>
                </div>
                <Link to="/reports" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 shadow-sm flex items-center gap-2">
                    Generar Cierre Mensual
                    <ArrowRight className="w-4 h-4" />
                </Link>
            </div>

            {/* Alert Banner - Missing Recurring Invoices */}
            {hasMissingInvoices && (
                <div className="card p-4 bg-amber-50 border-amber-200 border-l-4 border-l-amber-500">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <h4 className="font-semibold text-amber-800">
                                {missingInvoices.length} factura{missingInvoices.length > 1 ? 's' : ''} recurrente{missingInvoices.length > 1 ? 's' : ''} sin registrar este mes
                            </h4>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {missingInvoices.slice(0, 5).map((alert: any) => (
                                    <Link
                                        key={alert.providerId}
                                        to="/invoices"
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-amber-200 rounded-lg text-sm text-amber-800 hover:bg-amber-100 transition-colors"
                                    >
                                        <RefreshCw className="w-3 h-3" />
                                        {alert.providerName}
                                    </Link>
                                ))}
                                {
                                    missingInvoices.length > 5 && (
                                        <span className="text-sm text-amber-600">y {missingInvoices.length - 5} más...</span>
                                    )
                                }
                            </div>
                        </div>
                        <Link
                            to="/invoices"
                            className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
                        >
                            Registrar
                        </Link>
                    </div>
                </div>
            )}

            {/* Bento Grid Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((stat, i) => (
                    <div key={i} className="card p-5 hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-sm text-gray-500 font-medium">{stat.label}</p>
                                <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
                                <p className={`text-xs mt-2 font-medium ${stat.positive ? 'text-emerald-600' : 'text-amber-600'}`}>
                                    {stat.change}
                                </p>
                            </div>
                            <div className={`p-2.5 rounded-lg ${stat.positive ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                                <stat.icon className={`w-5 h-5 ${stat.positive ? 'text-emerald-600' : 'text-amber-600'}`} strokeWidth={1.5} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Recent Payments + Quick Actions */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Recent Payments */}
                <div className="lg:col-span-2 card">
                    <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                        <h3 className="font-semibold text-gray-900">Últimos Egresos</h3>
                        <Link to="/payments" className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
                            Ver todos →
                        </Link>
                    </div>
                    {paymentsLoading ? (
                        <div className="p-8 flex justify-center">
                            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                        </div>
                    ) : recentPayments.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                            <p>No hay egresos registrados</p>
                            <Link to="/payments" className="text-indigo-600 hover:underline text-sm mt-2 inline-block">
                                Crear primer egreso →
                            </Link>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-50">
                            {recentPayments.map((payment) => (
                                <div key={payment.id} className="p-4 flex items-center justify-between hover:bg-gray-50/50">
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs font-mono text-gray-400">
                                            #{payment.consecutiveNumber?.toString().padStart(3, '0') || '---'}
                                        </span>
                                        <div>
                                            <p className="font-medium text-gray-900">{payment.provider?.name || 'Sin proveedor'}</p>
                                            <p className="text-xs text-gray-500">
                                                {new Date(payment.paymentDate).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="font-semibold text-gray-900">{formatMoney(Number(payment.netValue))}</span>
                                        <span className={`status-pill ${statusStyles[payment.status]}`}>
                                            {statusLabels[payment.status] || payment.status}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Quick Actions */}
                <div className="card p-4">
                    <h3 className="font-semibold text-gray-900 mb-4">Acciones Rápidas</h3>
                    <div className="space-y-2">
                        <Link to="/invoices" className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 text-gray-700">
                            <FileWarning className="w-5 h-5 text-indigo-500" />
                            <div>
                                <p className="font-medium">Registrar Factura</p>
                                <p className="text-xs text-gray-500">Causar nueva deuda</p>
                            </div>
                        </Link>
                        <Link to="/payments" className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 text-gray-700">
                            <TrendingDown className="w-5 h-5 text-emerald-500" />
                            <div>
                                <p className="font-medium">Registrar Pago</p>
                                <p className="text-xs text-gray-500">Crear egreso bancario</p>
                            </div>
                        </Link>
                        <Link to="/conciliation" className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 text-gray-700">
                            <Wallet className="w-5 h-5 text-amber-500" />
                            <div>
                                <p className="font-medium">Conciliar Banco</p>
                                <p className="text-xs text-gray-500">Cruzar movimientos</p>
                            </div>
                        </Link>
                        <Link to="/reports" className="flex items-center gap-3 p-3 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100">
                            <ArrowRight className="w-5 h-5" />
                            <div>
                                <p className="font-medium">Cierre Mensual</p>
                                <p className="text-xs text-indigo-600">Generar informes y carpeta mensual</p>
                            </div>
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    )
}
