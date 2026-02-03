import { TrendingUp, TrendingDown, FileWarning, Wallet, ArrowRight, AlertTriangle, RefreshCw, Loader2, Mail, Sparkles, Eye, X, CheckCircle2, Clock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getMissingRecurringInvoices, getInvoiceStats, getPayments, getInvoices, getGmailStatus, getGmailPreview, connectGmail } from '../lib/api'
import { useUnit } from '../lib/UnitContext'
import { useAI } from '../lib/AIContext'
import { AIProcessingOverlay } from '../components/ui'
import type { Payment } from '../lib/api'
import { useState, useEffect } from 'react'
import { formatMoney } from '../lib/format'
import { formatRelativeTime } from '../lib/dateUtils'

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

    // Gmail integration
    const queryClient = useQueryClient()
    const { data: gmailStatus } = useQuery({
        queryKey: ['gmail-status', unitId],
        queryFn: () => getGmailStatus(unitId),
        enabled: !!unitId,
        refetchInterval: 5000
    })

    // Draft items from Gmail scan
    const { data: invoicesData } = useQuery({
        queryKey: ['invoices', unitId],
        queryFn: () => getInvoices({ unitId }),
        enabled: !!unitId
    })
    const draftInvoices = (invoicesData?.invoices || []).filter((inv: any) => inv.status === 'DRAFT')
    const draftPayments = payments.filter(p => p.status === 'DRAFT')
    const pendingReviewCount = draftInvoices.length + draftPayments.length

    // AI Scan context
    const { scanState, startBackgroundScan, minimizeScanUI } = useAI()
    const isScanning = (scanState.status === 'PROCESSING' || scanState.status === 'PENDING') && scanState.unitId === unitId
    const showOverlay = isScanning && !scanState.minimized

    // Preview modal state
    const [showPreviewModal, setShowPreviewModal] = useState(false)

    // Refresh data when scan completes
    useEffect(() => {
        if (scanState.status === 'COMPLETED') {
            queryClient.invalidateQueries({ queryKey: ['invoices'] })
            queryClient.invalidateQueries({ queryKey: ['payments'] })
            queryClient.invalidateQueries({ queryKey: ['invoice-stats'] })
            queryClient.invalidateQueries({ queryKey: ['units'] })
        }
    }, [scanState.status, queryClient])

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
        <>
            <div className="space-y-6 animate-fade-in">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
                        <p className="text-sm text-gray-500 mt-1">Resumen financiero de {currentMonth}</p>
                    </div>
                    <Link to="/closure" className="px-4 py-2 bg-brand-primary text-white rounded-button text-sm font-medium hover:bg-brand-700 shadow-sm flex items-center gap-2">
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

                {/* AI Processing Overlay for Gmail Scan */}
                <AIProcessingOverlay
                    visible={showOverlay}
                    message={scanState.message || 'Iniciando escaneo...'}
                    subMessage="Esto puede tomar unos minutos dependiendo de la cantidad de correos."
                    progress={scanState.progress > 0 ? scanState.progress : undefined}
                    onMinimize={minimizeScanUI}
                />

                {/* Gmail Center Card */}
                <div className="card p-5 bg-gradient-to-br from-indigo-50 via-white to-purple-50 border border-indigo-100">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-indigo-100 rounded-xl">
                                <Mail className="w-6 h-6 text-indigo-600" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-gray-900">Centro de Gmail</h3>
                                {gmailStatus?.connected ? (
                                    <div className="space-y-1 mt-1">
                                        <div className="flex items-center gap-2">
                                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                                            <span className="text-sm text-green-700 font-medium">{gmailStatus.email}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-gray-500">
                                            <Clock className="w-3 h-3" />
                                            <span>Último escaneo: {formatRelativeTime(selectedUnit?.gmailLastAutoScan)}</span>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-500 mt-1">No hay cuenta vinculada</p>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            {gmailStatus?.connected ? (
                                <>
                                    <button
                                        onClick={() => setShowPreviewModal(true)}
                                        className="px-4 py-2 border border-gray-200 bg-white text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center gap-2 shadow-sm"
                                        title="Ver últimos correos recibidos"
                                    >
                                        <Eye className="w-4 h-4" />
                                        Ver Buzón
                                    </button>
                                    <button
                                        onClick={() => startBackgroundScan(unitId)}
                                        disabled={isScanning}
                                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <Sparkles className="w-4 h-4" />
                                        {isScanning ? 'Escaneando...' : 'Escanear Inbox'}
                                    </button>
                                </>
                            ) : (
                                <button
                                    onClick={() => connectGmail(unitId)}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2 shadow-sm"
                                >
                                    <Mail className="w-4 h-4" />
                                    Conectar Gmail
                                </button>
                            )}
                        </div>
                    </div>
                    {/* Scan Results Info */}
                    {scanState.status === 'COMPLETED' && (
                        <div className="mt-4 pt-4 border-t border-indigo-100 flex items-center gap-2 text-sm text-indigo-700">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>{scanState.message}</span>
                        </div>
                    )}
                </div>

                {/* Pending Review Alert */}
                {pendingReviewCount > 0 && (
                    <div className="card p-4 bg-purple-50 border-purple-200 border-l-4 border-l-purple-500">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Sparkles className="w-5 h-5 text-purple-600" />
                                <div>
                                    <h4 className="font-semibold text-purple-900">
                                        {pendingReviewCount} item{pendingReviewCount > 1 ? 's' : ''} importado{pendingReviewCount > 1 ? 's' : ''} requieren revisión
                                    </h4>
                                    <p className="text-sm text-purple-700 mt-0.5">
                                        {draftInvoices.length > 0 && `${draftInvoices.length} factura${draftInvoices.length > 1 ? 's' : ''}`}
                                        {draftInvoices.length > 0 && draftPayments.length > 0 && ' y '}
                                        {draftPayments.length > 0 && `${draftPayments.length} egreso${draftPayments.length > 1 ? 's' : ''}`}
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                {draftInvoices.length > 0 && (
                                    <Link
                                        to="/invoices?status=DRAFT"
                                        className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700"
                                    >
                                        Ver Facturas
                                    </Link>
                                )}
                                {draftPayments.length > 0 && (
                                    <Link
                                        to="/payments?status=DRAFT"
                                        className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700"
                                    >
                                        Ver Egresos
                                    </Link>
                                )}
                            </div>
                        </div>
                    </div>
                )}

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
                            <Link to="/closure" className="flex items-center gap-3 p-3 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100">
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

            {/* Gmail Preview Modal - Outside animate-fade-in */}
            {showPreviewModal && (
                <GmailPreviewModal unitId={unitId} onClose={() => setShowPreviewModal(false)} />
            )}
        </>
    )
}

// Gmail Preview Modal Component
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
                        Buzón Inteligente (Últimos 10 correos)
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
                        <div className="p-4 bg-red-50 text-red-700 rounded-lg flex flex-col gap-3">
                            <div className="flex items-center gap-2 font-medium">
                                <AlertTriangle className="w-5 h-5" />
                                {error.message.includes('GMAIL_AUTH_EXPIRED') || error.message.includes('Auth Expired')
                                    ? 'La conexión con Gmail ha expirado o fue revocada.'
                                    : 'Error al cargar la previsualización. Verifica tu conexión.'}
                            </div>
                            {(error.message.includes('GMAIL_AUTH_EXPIRED') || error.message.includes('Auth Expired')) && (
                                <button
                                    onClick={() => connectGmail(unitId)}
                                    className="w-full py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 shadow-sm"
                                >
                                    Reconectar cuenta de Gmail
                                </button>
                            )}
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
                    Nota: El escaneo procesa correos con facturas (PDF/ZIP) recibidos desde la fecha configurada.
                </div>
            </div>
        </div>
    )
}
