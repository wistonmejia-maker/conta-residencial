import { Upload, CheckCircle, XCircle, ArrowRight, X, FileSpreadsheet, AlertCircle, Filter, Wand2, Eye, EyeOff } from 'lucide-react'
import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getBankMovements, getPayments, importBankMovements, conciliate, getConciliationSummary, autoConciliate } from '../lib/api'
import type { BankMovement, Payment } from '../lib/api'
import { useUnit } from '../lib/UnitContext'

const formatMoney = (value: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value)

// Patterns for transactions to EXCLUDE (fees, system charges, credits/income)
const EXCLUDE_PATTERNS = [
    'COMISION',
    'NOTA DEBITO I.V.A',
    'CRED VENTAS PSE',    // Ingresos PSE
    'NC RECAUDOS',        // Notas crédito recaudos
    'CRE TRANSF ACH',     // Créditos ACH
    'GMF',                // 4x1000
]

export default function ConciliationPage() {
    const { selectedUnit } = useUnit()
    const unitId = selectedUnit?.id || ''
    const navigate = useNavigate()


    const [selectedBank, setSelectedBank] = useState<string | null>(null)
    const [showImportModal, setShowImportModal] = useState(false)
    const [showCredits, setShowCredits] = useState(false) // Toggle for Incomes
    const [hideSystemData, setHideSystemData] = useState(true) // Toggle for System Charges
    const queryClient = useQueryClient()

    const { data: bankData, isLoading: bankLoading } = useQuery({
        queryKey: ['bank-movements', unitId],
        queryFn: () => getBankMovements({ unitId }),
        enabled: !!unitId
    })

    const { data: paymentsData, isLoading: paymentsLoading } = useQuery({
        queryKey: ['payments', unitId],
        queryFn: () => getPayments({ unitId }),
        enabled: !!unitId
    })

    const { data: summaryData } = useQuery({
        queryKey: ['conciliation-summary', unitId],
        queryFn: () => getConciliationSummary(unitId),
        enabled: !!unitId
    })

    const bankMovements: BankMovement[] = bankData?.movements || []
    const payments: (Payment & { provider?: { name: string } })[] = paymentsData?.payments || []
    const summary = summaryData || { totalBankMovements: 0, conciliatedMovements: 0, pendingMovements: 0 }

    const unmatchedBank = bankMovements.filter(m => !m.isConciliated)
    const unmatchedPayments = payments.filter(p => p.status !== 'CONCILIATED')

    const conciliateMutation = useMutation({
        mutationFn: ({ paymentId, bankMovementId }: { paymentId: string; bankMovementId: string }) =>
            conciliate(paymentId, bankMovementId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['bank-movements'] })
            queryClient.invalidateQueries({ queryKey: ['payments'] })
            queryClient.invalidateQueries({ queryKey: ['conciliation-summary'] })
            setSelectedBank(null)
        }
    })

    const autoConciliateMutation = useMutation({
        mutationFn: () => autoConciliate(unitId),
        onSuccess: (data: any) => {
            queryClient.invalidateQueries({ queryKey: ['bank-movements'] })
            queryClient.invalidateQueries({ queryKey: ['payments'] })
            queryClient.invalidateQueries({ queryKey: ['conciliation-summary'] })
            alert(data.message || 'Auto-conciliación completada')
        },
        onError: () => alert('Error en auto-conciliación')
    })

    const handleConciliate = (paymentId: string) => {
        if (!selectedBank) return
        conciliateMutation.mutate({ paymentId, bankMovementId: selectedBank })
    }

    const selectedBankAmount = selectedBank
        ? Math.abs(Number(bankMovements.find(m => m.id === selectedBank)?.amount || 0))
        : 0


    // Filter display logic
    const displayedBank = bankMovements.filter(m => {
        const amount = Number(m.amount)
        const isCredit = amount > 0
        const isSystem = EXCLUDE_PATTERNS.some(p => (m.description || '').toUpperCase().includes(p))

        if (showCredits !== isCredit) return false // Toggle between Credits/Debits
        if (hideSystemData && isSystem) return false // Hide garbage

        return true
    })



    return (
        <div className="space-y-6 animate-fade-in h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Conciliación Bancaria</h1>
                    <p className="text-sm text-gray-500 mt-1">Cruza los movimientos del banco con tus egresos</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => autoConciliateMutation.mutate()}
                        disabled={autoConciliateMutation.isPending || unmatchedBank.length === 0}
                        className="px-4 py-2 border border-indigo-200 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-100 shadow-sm flex items-center gap-2 disabled:opacity-50"
                    >
                        <Wand2 className="w-4 h-4" />
                        {autoConciliateMutation.isPending ? 'Conciliando...' : 'Auto-Conciliar'}
                    </button>
                    <button
                        onClick={() => setShowImportModal(true)}
                        className="px-4 py-2 border border-gray-200 bg-white text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 shadow-sm flex items-center gap-2"
                    >
                        <Upload className="w-4 h-4" />
                        Importar Extracto
                    </button>
                    <button
                        // Redirect to Reports page to perform the actual closure
                        onClick={() => navigate('/reports')}
                        disabled={unmatchedBank.length > 0}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <CheckCircle className="w-4 h-4" />
                        Cerrar Mes
                    </button>
                </div>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="card p-4 border-l-4 border-l-amber-500">
                    <p className="text-sm text-gray-500">Pendientes Banco</p>
                    <p className="text-xl font-bold text-gray-900 mt-1">{unmatchedBank.length} movimientos</p>
                    <p className="text-xs text-amber-600 mt-1">{formatMoney(unmatchedBank.reduce((s, m) => s + Math.abs(Number(m.amount)), 0))}</p>
                </div>
                <div className="card p-4 border-l-4 border-l-indigo-500">
                    <p className="text-sm text-gray-500">Pendientes App</p>
                    <p className="text-xl font-bold text-gray-900 mt-1">{unmatchedPayments.length} egresos</p>
                    <p className="text-xs text-indigo-600 mt-1">{formatMoney(unmatchedPayments.reduce((s, p) => s + Number(p.netValue), 0))}</p>
                </div>
                <div className="card p-4 border-l-4 border-l-emerald-500">
                    <p className="text-sm text-gray-500">Conciliados</p>
                    <p className="text-xl font-bold text-gray-900 mt-1">{summary.conciliatedMovements} registros</p>
                    <p className="text-xs text-emerald-600 mt-1">✓ Sin diferencias</p>
                </div>
            </div>

            {/* Split View */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0">
                {/* Bank Side */}
                <div className="card flex flex-col overflow-hidden">
                    <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                        <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                            🏦 Extracto Bancario
                        </h3>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowCredits(!showCredits)}
                                className={`text-[10px] px-2 py-1 rounded font-medium border ${showCredits ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}
                            >
                                {showCredits ? 'Viendo Ingresos' : 'Viendo Egresos'}
                            </button>
                            <button
                                onClick={() => setHideSystemData(!hideSystemData)}
                                className={`p-1 rounded hover:bg-gray-200 ${hideSystemData ? 'text-gray-400' : 'text-indigo-600'}`}
                                title="Ocultar cobros del sistema (IVA, GMF, etc)"
                            >
                                {hideSystemData ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            </button>
                            <span className="text-xs text-gray-500">{displayedBank.length} regs</span>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                        {bankLoading ? (
                            <div className="p-4 text-center text-gray-500">Cargando...</div>
                        ) : bankMovements.length === 0 ? (
                            <div className="p-8 text-center">
                                <FileSpreadsheet className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                                <p className="text-gray-500">No hay movimientos bancarios</p>
                                <button
                                    onClick={() => setShowImportModal(true)}
                                    className="mt-3 text-indigo-600 hover:text-indigo-700 text-sm font-medium"
                                >
                                    + Importar extracto Bancolombia
                                </button>
                            </div>
                        ) : (
                            displayedBank.map(mov => (
                                <div
                                    key={mov.id}
                                    onClick={() => !mov.isConciliated && setSelectedBank(mov.id === selectedBank ? null : mov.id)}
                                    className={`p-3 rounded-lg border cursor-pointer transition-all ${mov.isConciliated
                                        ? 'bg-emerald-50/50 border-emerald-200 opacity-60'
                                        : selectedBank === mov.id
                                            ? 'bg-indigo-50 border-indigo-300 shadow-sm'
                                            : 'bg-white border-gray-100 hover:border-indigo-200'
                                        }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-gray-900 truncate">{mov.description || 'Sin descripción'}</p>
                                            <p className="text-xs text-gray-500">
                                                {new Date(mov.transactionDate).toLocaleDateString('es-CO')} • {mov.referenceCode || 'Sin ref'}
                                            </p>
                                        </div>
                                        <div className="text-right ml-3">
                                            <p className={`font-semibold ${Number(mov.amount) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                                {formatMoney(Number(mov.amount))}
                                            </p>
                                            {mov.isConciliated && <span className="text-xs text-emerald-600">✓ Conciliado</span>}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* App Side */}
                <div className="card flex flex-col overflow-hidden">
                    <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                        <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                            📑 Egresos Registrados
                        </h3>
                        <span className="text-xs text-gray-500">
                            {selectedBank ? `Buscar: ${formatMoney(selectedBankAmount)}` : 'Selecciona movimiento bancario'}
                        </span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                        {paymentsLoading ? (
                            <div className="p-4 text-center text-gray-500">Cargando...</div>
                        ) : payments.length === 0 ? (
                            <div className="p-8 text-center text-gray-500">No hay egresos registrados</div>
                        ) : (
                            payments.map(pay => {
                                const isMatch = selectedBank && Math.abs(Number(pay.netValue) - selectedBankAmount) < 1
                                return (
                                    <div
                                        key={pay.id}
                                        className={`p-3 rounded-lg border transition-all ${pay.status === 'CONCILIATED'
                                            ? 'bg-emerald-50/50 border-emerald-200 opacity-60'
                                            : isMatch
                                                ? 'bg-green-50 border-green-300 shadow-sm'
                                                : selectedBank
                                                    ? 'bg-white border-gray-100 hover:border-indigo-300 cursor-pointer hover:shadow-sm'
                                                    : 'bg-white border-gray-100'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    {pay.consecutiveNumber && (
                                                        <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
                                                            CE-{pay.consecutiveNumber}
                                                        </span>
                                                    )}
                                                    <p className="text-sm font-medium text-gray-900">{pay.provider?.name || 'N/A'}</p>
                                                </div>
                                                <p className="text-xs text-gray-500 mt-0.5">
                                                    {new Date(pay.paymentDate).toLocaleDateString('es-CO')}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="text-right">
                                                    <p className="font-semibold text-gray-900">{formatMoney(Number(pay.netValue))}</p>
                                                    {isMatch && <span className="text-xs text-green-600">✓ Coincide</span>}
                                                </div>
                                                {selectedBank && pay.status !== 'CONCILIATED' && (
                                                    <button
                                                        onClick={() => handleConciliate(pay.id)}
                                                        disabled={conciliateMutation.isPending}
                                                        className="p-1.5 bg-indigo-100 hover:bg-indigo-200 rounded-lg text-indigo-600 disabled:opacity-50"
                                                    >
                                                        <ArrowRight className="w-4 h-4" />
                                                    </button>
                                                )}
                                                {pay.status === 'CONCILIATED' && <span className="text-xs text-emerald-600">✓</span>}
                                            </div>
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </div>
                </div>
            </div>

            {/* Warning for unconciliated */}
            {
                unmatchedBank.length > 0 && (
                    <div className="card p-4 bg-amber-50 border-amber-200 flex items-center gap-3">
                        <XCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                        <p className="text-sm text-amber-800">
                            <span className="font-semibold">Atención:</span> Hay {unmatchedBank.length} movimiento(s) bancario(s) sin justificar. No podrás cerrar el mes hasta conciliar todo.
                        </p>
                    </div>
                )
            }

            {/* Import Modal */}
            {
                showImportModal && (
                    <ImportModal
                        unitId={unitId}
                        onClose={() => setShowImportModal(false)}
                        onSuccess={() => {
                            setShowImportModal(false)
                            queryClient.invalidateQueries({ queryKey: ['bank-movements'] })
                            queryClient.invalidateQueries({ queryKey: ['conciliation-summary'] })
                        }}
                    />
                )
            }
        </div >
    )
}

import { read, utils } from 'xlsx'

// ... existing imports ...

// Bancolombia XLS/CSV Import Modal
function ImportModal({ unitId, onClose, onSuccess }: { unitId: string; onClose: () => void; onSuccess: () => void }) {
    const [allData, setAllData] = useState<{ date: string; description: string; amount: number; reference: string; include: boolean }[]>([])
    const [error, setError] = useState<string | null>(null)
    const [preview, setPreview] = useState(false)
    const [filterPayments, setFilterPayments] = useState(true)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const importMutation = useMutation({
        mutationFn: () => {
            const toImport = allData.filter(row => row.include)
            return importBankMovements(unitId, toImport.map(row => ({
                transactionDate: row.date,
                description: row.description,
                amount: row.amount,
                referenceCode: row.reference
            })))
        },
        onSuccess,
        onError: (err: Error) => setError(err.message)
    })

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setError(null)
        const reader = new FileReader()

        reader.onload = (event) => {
            try {
                const data = event.target?.result
                const workbook = read(data, { type: 'array' })
                const firstSheetName = workbook.SheetNames[0]
                const worksheet = workbook.Sheets[firstSheetName]
                const jsonData = utils.sheet_to_json(worksheet, { header: 1 }) as any[][]

                if (!jsonData || jsonData.length === 0) {
                    throw new Error('El archivo está vacío')
                }

                console.log('File processing started - v3 (Safe Mode)')


                // Detect Format based on Header Row presence
                let headerRowIndex = -1
                let isBancolombia = false

                // Helper to normalize strings
                const normalize = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim()

                // Scan first 100 rows (increased from 20) for header signature with ROBUST and NORMALIZED matching
                for (let i = 0; i < Math.min(jsonData.length, 100); i++) {
                    const rawRow = jsonData[i]
                    if (!Array.isArray(rawRow)) continue

                    // Use Array.from for sparse arrays + Normalization
                    const row = Array.from(rawRow).map(c => {
                        if (c === null || c === undefined) return ''
                        return normalize(String(c))
                    })

                    // Robust check: 
                    // 1. Date column
                    // 2. Description/Transaction column
                    // 3. Amount/Balance column (Crucial to avoid metadata rows like "Fecha Transacción: ...")
                    const hasDate = row.some(c => c && c.includes('FECHA'))
                    const hasDesc = row.some(c => c && (c.includes('TRANSACCI') || c.includes('DESCRIPCI') || c.includes('DETALLE')))
                    const hasAmount = row.some(c => c && (
                        c.includes('SALDO') ||
                        c.includes('DEBITO') || c.includes('CREDITO') ||
                        c.includes('VALOR') || c.includes('MONTO') || c.includes('IMPORTE') ||
                        c.includes('CARGO') || c.includes('ABONO') ||
                        c.includes('RETIRO') || c.includes('DEPOSITO')
                    ))

                    if (hasDate && hasDesc && hasAmount) {
                        headerRowIndex = i
                        isBancolombia = true
                        break
                    }
                }

                let parsedData: typeof allData = []

                // Debug variables declared in outer scope
                let idxFecha = -1
                let idxDesc = -1
                let idxRef = -1
                let idxDebito = -1
                let idxCredito = -1
                let idxValor = -1

                if (isBancolombia) {
                    // Bancolombia / AV Villas Layout
                    const rawHeader = jsonData[headerRowIndex]
                    const headerRow = Array.from(Array.isArray(rawHeader) ? rawHeader : []).map(c => {
                        if (c === null || c === undefined) return ''
                        return normalize(String(c))
                    })
                    console.log('Import: Headers Detected (Normalized):', headerRow)

                    idxFecha = headerRow.findIndex(c => c.includes('FECHA'))
                    idxDesc = headerRow.findIndex(c => c.includes('TRANSACCI') || c.includes('DESCRIPCI') || c.includes('DETALLE'))
                    idxRef = headerRow.findIndex(c => c.includes('DOCUMENTO') || c.includes('REFERENCIA') || c.includes('DOC') || c.includes('SUCURSAL'))

                    idxDebito = headerRow.findIndex(c => c.includes('DEBITO') || c.includes('RETIRO') || c.includes('CARGO') || c.includes('VALOR'))
                    idxCredito = headerRow.findIndex(c => c.includes('CREDITO') || c.includes('ABONO') || c.includes('DEPOSITO'))
                    idxValor = headerRow.findIndex(c => c === 'VALOR' || c.includes('IMPORTE') || c.includes('MONTO'))

                    console.log('Import: Column Indices:', { idxFecha, idxDesc, idxRef, idxDebito, idxCredito, idxValor })

                    for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
                        const row = jsonData[i]
                        if (!row || !row[idxFecha]) continue

                        // Date Parsing
                        let dateStr = ''
                        if (typeof row[idxFecha] === 'number') {
                            const dateObj = new Date(Math.round((row[idxFecha] - 25569) * 86400 * 1000))
                            dateStr = dateObj.toISOString().split('T')[0]
                        } else {
                            dateStr = String(row[idxFecha]).trim().replace(/\//g, '-')
                        }

                        const description = String(row[idxDesc] || '').trim()
                        const ref = String(row[idxRef] || '').trim()

                        // Amount Parsing
                        const parseVal = (v: any) => {
                            if (!v) return 0
                            // keep digits, dots, and minus. Remove currency symbols and commas (thousands)
                            // Warning: This assumes English number format (1,000.00). If european (1.000,00), this breaks.
                            // Based on user file: 150,000.00 -> English.
                            const clean = String(v).replace(/[^0-9.-]/g, '')
                            return parseFloat(clean) || 0
                        }

                        let amount = 0

                        if (idxDebito !== -1 && idxCredito !== -1) {
                            const deb = parseVal(row[idxDebito])
                            const cred = parseVal(row[idxCredito])
                            amount = cred - deb
                        } else if (idxValor !== -1) {
                            amount = parseVal(row[idxValor])
                        }

                        if (amount !== 0 && !isNaN(amount)) {
                            parsedData.push({
                                date: dateStr,
                                description,
                                amount,
                                reference: ref,
                                include: true
                            })
                        }
                    }

                } else {
                    // Standard Simple CSV/Excel: [Date, Description, Amount, Reference]
                    // Assume Row 1 is header, Data starts Row 2
                    // OR if first row looks like data, start there.

                    const startIndex = isNaN(Date.parse(String(jsonData[0][0]))) ? 1 : 0

                    for (let i = startIndex; i < jsonData.length; i++) {
                        const row = jsonData[i]
                        if (!row[0]) continue

                        let dateStr = ''
                        if (typeof row[0] === 'number') {
                            const dateObj = new Date(Math.round((row[0] - 25569) * 86400 * 1000))
                            dateStr = dateObj.toISOString().split('T')[0]
                        } else {
                            dateStr = String(row[0]).replace(/\//g, '-')
                        }

                        const description = String(row[1] || '').trim()
                        // Amount could be in column 2
                        let amount = typeof row[2] === 'number' ? row[2] : parseFloat(String(row[2]).replace(/[^0-9.-]/g, ''))
                        const ref = String(row[3] || '')

                        if (!isNaN(amount)) {
                            parsedData.push({
                                date: dateStr,
                                description,
                                amount,
                                reference: ref,
                                include: true
                            })
                        }
                    }
                }

                if (parsedData.length === 0) {
                    // Debugging info in the error message
                    const debugInfo = {
                        foundHeaderRow: headerRowIndex,
                        headers: isBancolombia ? jsonData[headerRowIndex]?.map((c: any) => String(c)) : 'Standard',
                        indices: isBancolombia ? { idxFecha, idxDesc, idxDebito, idxCredito, idxValor } : 'N/A',
                        parsedCount: parsedData.length
                    }
                    console.error('Import Debug:', debugInfo)
                    throw new Error(`No se encontraron transacciones válidas. DEBUG: ${JSON.stringify(debugInfo, null, 2)}`)
                }

                setAllData(parsedData)
                setPreview(true)
            } catch (err) {
                console.error(err)
                const msg = err instanceof Error ? err.message : 'Error leyendo el archivo'
                setError(msg)
            }
        }
        reader.readAsArrayBuffer(file)
    }

    const toggleInclude = (idx: number) => {
        setAllData(prev => prev.map((row, i) => i === idx ? { ...row, include: !row.include } : row))
    }

    const selectedCount = allData.filter(r => r.include).length
    const displayData = filterPayments ? allData.filter(r => r.include) : allData

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between p-4 border-b">
                    <h2 className="text-lg font-semibold text-gray-900">Importar Extracto Bancario</h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <div className="p-4 flex-1 overflow-y-auto">
                    {!preview ? (
                        <div className="space-y-4">
                            {/* File format info */}
                            <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                                <h4 className="font-medium text-blue-900 mb-2">📄 Formatos Soportados</h4>
                                <div className="text-sm text-blue-700 space-y-2">
                                    <p><strong>Bancolombia XLS:</strong> Archivo descargado de la Sucursal Virtual (Detalles de Movimientos)</p>
                                    <p><strong>CSV estándar:</strong> Fecha, Descripción, Valor, Referencia</p>
                                </div>
                                <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                                    <strong>💡 Nota:</strong> Ahora se importan TODOS los movimientos. Podrás filtrarlos después en la pantalla principal.
                                </div>
                            </div>

                            {/* Upload button */}
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-all"
                            >
                                <Upload className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                                <p className="text-gray-600 mb-1">Arrastra tu archivo XLS/CSV</p>
                                <p className="text-xs text-gray-400">o haz clic para seleccionar</p>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".xls,.xlsx,.csv,.txt"
                                    onChange={handleFileUpload}
                                    className="hidden"
                                />
                            </div>

                            {error && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-red-700">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                    <p className="text-sm">{error}</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Preview header */}
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="font-medium text-gray-900">Vista previa</h4>
                                    <p className="text-xs text-gray-500">
                                        {selectedCount} de {allData.length} transacciones seleccionadas para importar
                                    </p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={filterPayments}
                                            onChange={(e) => setFilterPayments(e.target.checked)}
                                            className="rounded border-gray-300 text-indigo-600"
                                        />
                                        <Filter className="w-3 h-3" />
                                        Solo pagos
                                    </label>
                                    <button
                                        onClick={() => { setPreview(false); setAllData([]) }}
                                        className="text-sm text-indigo-600 hover:text-indigo-700"
                                    >
                                        Cambiar archivo
                                    </button>
                                </div>
                            </div>

                            <div className="border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 sticky top-0">
                                        <tr>
                                            <th className="text-center px-2 py-2 w-10">✓</th>
                                            <th className="text-left px-3 py-2 font-medium text-gray-600">Fecha</th>
                                            <th className="text-left px-3 py-2 font-medium text-gray-600">Descripción</th>
                                            <th className="text-right px-3 py-2 font-medium text-gray-600">Valor</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {displayData.map((row) => {
                                            const originalIdx = allData.findIndex(r => r === row)
                                            return (
                                                <tr
                                                    key={originalIdx}
                                                    className={`hover:bg-gray-50 cursor-pointer ${row.include ? '' : 'opacity-50'}`}
                                                    onClick={() => toggleInclude(originalIdx)}
                                                >
                                                    <td className="px-2 py-2 text-center">
                                                        <input
                                                            type="checkbox"
                                                            checked={row.include}
                                                            onChange={() => toggleInclude(originalIdx)}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="rounded border-gray-300 text-indigo-600"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2 whitespace-nowrap">{new Date(row.date).toLocaleDateString('es-CO')}</td>
                                                    <td className="px-3 py-2 truncate max-w-xs" title={row.description}>{row.description}</td>
                                                    <td className={`px-3 py-2 text-right font-medium whitespace-nowrap ${row.amount < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                                        {formatMoney(row.amount)}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Summary */}
                            <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
                                <div className="text-sm text-gray-600">
                                    <span className="font-medium">{selectedCount}</span> transacciones a importar
                                </div>
                                <div className="text-sm font-semibold text-red-600">
                                    Total: {formatMoney(allData.filter(r => r.include).reduce((s, r) => s + r.amount, 0))}
                                </div>
                            </div>

                            {error && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-red-700">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                    <p className="text-sm">{error}</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-3 p-4 border-t">
                    <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg text-sm font-medium">
                        Cancelar
                    </button>
                    {preview && (
                        <button
                            onClick={() => importMutation.mutate()}
                            disabled={importMutation.isPending || selectedCount === 0}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                        >
                            {importMutation.isPending ? 'Importando...' : `Importar ${selectedCount} movimientos`}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
