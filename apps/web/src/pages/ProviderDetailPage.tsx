import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, FileText, CreditCard, FolderOpen, ExternalLink, Loader2, User, Building2 } from 'lucide-react'
import { useUnit } from '../lib/UnitContext'
import { getProviderDetail } from '../lib/api'
import { formatMoney } from '../lib/format'


const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })

const docTypeLabels: Record<string, string> = {
    rut: 'RUT',
    pila: 'Planilla PILA',
    cert_bancaria: 'Certificación Bancaria',
    contrato: 'Contrato',
    otro: 'Otro'
}

const statusStyles: Record<string, string> = {
    PENDING: 'bg-amber-100 text-amber-700',
    PARTIAL: 'bg-blue-100 text-blue-700',
    PAID: 'bg-green-100 text-green-700'
}

export default function ProviderDetailPage() {
    const { id } = useParams<{ id: string }>()
    const { selectedUnit } = useUnit()

    const { data, isLoading, error } = useQuery({
        queryKey: ['provider-detail', id, selectedUnit?.id],
        queryFn: () => getProviderDetail(id!, selectedUnit?.id),
        enabled: !!id
    })

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
        )
    }

    if (error || !data?.provider) {
        return (
            <div className="text-center py-20">
                <p className="text-red-500">Error al cargar proveedor</p>
                <Link to="/providers" className="text-indigo-600 hover:underline mt-2 inline-block">
                    ← Volver a proveedores
                </Link>
            </div>
        )
    }

    const { provider, invoices, payments, stats } = data

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link to="/providers" className="p-2 hover:bg-gray-100 rounded-lg">
                    <ArrowLeft className="w-5 h-5 text-gray-600" />
                </Link>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold text-gray-900">{provider.name}</h1>
                    <p className="text-sm text-gray-500">NIT: {provider.nit}-{provider.dv} • {provider.taxType}</p>
                </div>
            </div>

            {/* Info Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Provider Info */}
                <div className="card p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <User className="w-4 h-4 text-indigo-600" />
                        <h3 className="font-semibold text-gray-900">Información</h3>
                    </div>
                    <div className="space-y-2 text-sm">
                        {provider.email && <p><span className="text-gray-500">Email:</span> {provider.email}</p>}
                        {provider.phone && <p><span className="text-gray-500">Tel:</span> {provider.phone}</p>}
                        {provider.address && <p><span className="text-gray-500">Dir:</span> {provider.address}</p>}
                        {provider.city && <p><span className="text-gray-500">Ciudad:</span> {provider.city}</p>}
                        {provider.bankName && (
                            <p><span className="text-gray-500">Banco:</span> {provider.bankName} - {provider.accountType}</p>
                        )}
                        {provider.bankAccount && (
                            <p><span className="text-gray-500">Cuenta:</span> {provider.bankAccount}</p>
                        )}
                    </div>
                </div>

                {/* Stats */}
                <div className="card p-4 lg:col-span-2">
                    <div className="flex items-center gap-2 mb-3">
                        <Building2 className="w-4 h-4 text-indigo-600" />
                        <h3 className="font-semibold text-gray-900">Resumen Financiero</h3>
                        {selectedUnit && (
                            <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full ml-auto">
                                {selectedUnit.name}
                            </span>
                        )}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                            <p className="text-xs text-gray-500 uppercase">Total Facturado</p>
                            <p className="text-lg font-bold text-gray-900">{formatMoney(stats.totalInvoiced)}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 uppercase">Pagado</p>
                            <p className="text-lg font-bold text-green-600">{formatMoney(stats.totalPaid)}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 uppercase">Pendiente</p>
                            <p className="text-lg font-bold text-amber-600">{formatMoney(stats.totalPending)}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 uppercase">Facturas / Pagos</p>
                            <p className="text-lg font-bold text-gray-900">{stats.invoiceCount} / {stats.paymentCount}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Invoices */}
            <div className="card">
                <div className="p-4 border-b border-gray-100 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-indigo-600" />
                    <h3 className="font-semibold text-gray-900">Facturas</h3>
                    <span className="text-xs text-gray-400 ml-auto">{invoices.length} registros</span>
                </div>
                {invoices.length === 0 ? (
                    <p className="p-4 text-gray-500 text-sm">No hay facturas registradas</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="text-left px-4 py-2 font-medium text-gray-600"># Factura</th>
                                    <th className="text-left px-4 py-2 font-medium text-gray-600">Fecha</th>
                                    <th className="text-left px-4 py-2 font-medium text-gray-600">Descripción</th>
                                    <th className="text-right px-4 py-2 font-medium text-gray-600">Monto</th>
                                    <th className="text-center px-4 py-2 font-medium text-gray-600">Estado</th>
                                    <th className="text-center px-4 py-2 font-medium text-gray-600 w-16">Doc</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {provider.invoices?.map((inv: any) => (
                                    <tr key={inv.id} className="hover:bg-gray-50/50">
                                        <td className="px-4 py-2 font-mono">{inv.invoiceNumber}</td>
                                        <td className="px-4 py-2">{formatDate(inv.invoiceDate)}</td>
                                        <td className="px-4 py-2 text-gray-600">{inv.description || '-'}</td>
                                        <td className="px-4 py-2 text-right font-medium">{formatMoney(inv.totalAmount)}</td>
                                        <td className="px-4 py-2 text-center">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusStyles[inv.status] || 'bg-gray-100'}`}>
                                                {inv.status === 'PENDING' ? 'Pendiente' : inv.status === 'PARTIAL' ? 'Parcial' : 'Pagada'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 text-center">
                                            {inv.fileUrl && (
                                                <a href={inv.fileUrl} target="_blank" rel="noopener noreferrer"
                                                    className="text-indigo-600 hover:text-indigo-800">
                                                    <ExternalLink className="w-4 h-4 inline" />
                                                </a>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Payments */}
            <div className="card">
                <div className="p-4 border-b border-gray-100 flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-indigo-600" />
                    <h3 className="font-semibold text-gray-900">Pagos / Comprobantes de Egreso</h3>
                    <span className="text-xs text-gray-400 ml-auto">{payments.length} registros</span>
                </div>
                {payments.length === 0 ? (
                    <p className="p-4 text-gray-500 text-sm">No hay pagos registrados</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="text-left px-4 py-2 font-medium text-gray-600">CE #</th>
                                    <th className="text-left px-4 py-2 font-medium text-gray-600">Fecha</th>
                                    <th className="text-left px-4 py-2 font-medium text-gray-600">Facturas</th>
                                    <th className="text-right px-4 py-2 font-medium text-gray-600">Valor Neto</th>
                                    <th className="text-center px-4 py-2 font-medium text-gray-600 w-20">Soporte</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {provider.payments?.map((pay: any) => (
                                    <tr key={pay.id} className="hover:bg-gray-50/50">
                                        <td className="px-4 py-2 font-mono">CE-{String(pay.consecutiveNumber).padStart(4, '0')}</td>
                                        <td className="px-4 py-2">{formatDate(pay.paymentDate)}</td>
                                        <td className="px-4 py-2 text-gray-600">
                                            {pay.invoicesIncluded.join(', ')}
                                        </td>
                                        <td className="px-4 py-2 text-right font-medium text-green-600">
                                            {formatMoney(pay.netValue)}
                                        </td>
                                        <td className="px-4 py-2 text-center">
                                            {pay.supportFileUrl && (
                                                <a href={pay.supportFileUrl} target="_blank" rel="noopener noreferrer"
                                                    className="text-indigo-600 hover:text-indigo-800">
                                                    <ExternalLink className="w-4 h-4 inline" />
                                                </a>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Documents */}
            <div className="card">
                <div className="p-4 border-b border-gray-100 flex items-center gap-2">
                    <FolderOpen className="w-4 h-4 text-indigo-600" />
                    <h3 className="font-semibold text-gray-900">Documentos del Proveedor</h3>
                    <span className="text-xs text-gray-400 ml-auto">{provider.documents.length} archivos</span>
                </div>
                {provider.documents.length === 0 ? (
                    <p className="p-4 text-gray-500 text-sm">No hay documentos cargados</p>
                ) : (
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {provider.documents?.map((doc: any) => (
                            <a key={doc.id} href={doc.fileUrl} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                                <FileText className="w-8 h-8 text-indigo-500" />
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-gray-900 truncate">{docTypeLabels[doc.type] || doc.type}</p>
                                    <p className="text-xs text-gray-500 truncate">{doc.fileName}</p>
                                    <p className="text-xs text-gray-400">{formatDate(doc.uploadedAt)}</p>
                                </div>
                                <ExternalLink className="w-4 h-4 text-gray-400" />
                            </a>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
