import { useState, useCallback } from 'react'
import { X, Upload, FileSpreadsheet, AlertCircle, CheckCircle, Loader2 } from 'lucide-react'
import * as XLSX from 'xlsx'
import { bulkImportProviders } from '../lib/api'
import type { Provider } from '../lib/api'

interface BulkImportModalProps {
    onClose: () => void
    onSuccess: () => void
}

interface PreviewRow {
    index: number
    name: string
    nit: string
    dv?: string
    taxType: string
    email?: string
    phone?: string
    address?: string
    city?: string
    bankName?: string
    bankAccount?: string
    accountType?: string
    defaultRetefuentePerc?: string
    defaultReteicaPerc?: string
    isRecurring?: string
    category?: string
    error?: string
}

// Expected column mapping
const COLUMN_MAP: Record<string, keyof PreviewRow> = {
    'nombre': 'name',
    'razon social': 'name',
    'nit': 'nit',
    'dv': 'dv',
    'digito verificacion': 'dv',
    'tipo': 'taxType',
    'tipo contribuyente': 'taxType',
    'email': 'email',
    'correo': 'email',
    'telefono': 'phone',
    'teléfono': 'phone',
    'direccion': 'address',
    'dirección': 'address',
    'ciudad': 'city',
    'banco': 'bankName',
    'cuenta': 'bankAccount',
    'numero cuenta': 'bankAccount',
    'tipo cuenta': 'accountType',
    'retefuente': 'defaultRetefuentePerc',
    '% retefuente': 'defaultRetefuentePerc',
    'reteica': 'defaultReteicaPerc',
    '% reteica': 'defaultReteicaPerc',
    'recurrente': 'isRecurring',
    'categoria': 'category'
}

export default function BulkImportModal({ onClose, onSuccess }: BulkImportModalProps) {
    const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'results'>('upload')
    const [previewData, setPreviewData] = useState<PreviewRow[]>([])
    const [importResults, setImportResults] = useState<{ created: number; failed: number; errors: any[] } | null>(null)
    const [dragActive, setDragActive] = useState(false)

    const parseExcel = useCallback((file: File) => {
        const reader = new FileReader()
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer)
                const workbook = XLSX.read(data, { type: 'array' })
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
                const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][]

                if (jsonData.length < 2) {
                    alert('El archivo debe tener al menos una fila de encabezados y una fila de datos')
                    return
                }

                // Map headers to our fields
                const headers = jsonData[0].map((h: string) =>
                    String(h).toLowerCase().trim()
                )
                const headerMap: Record<number, keyof PreviewRow> = {}
                headers.forEach((header: string, idx: number) => {
                    const mappedField = COLUMN_MAP[header]
                    if (mappedField) {
                        headerMap[idx] = mappedField
                    }
                })

                // Parse data rows
                const rows: PreviewRow[] = []
                for (let i = 1; i < jsonData.length; i++) {
                    const row = jsonData[i]
                    if (!row || row.length === 0) continue

                    const parsed: PreviewRow = {
                        index: i,
                        name: '',
                        nit: '',
                        taxType: 'Juridica'
                    }

                    Object.entries(headerMap).forEach(([idx, field]) => {
                        const value = row[parseInt(idx)]
                        if (value !== undefined && value !== null) {
                            (parsed as any)[field] = String(value).trim()
                        }
                    })

                    // Validate required fields
                    if (!parsed.name) {
                        parsed.error = 'Falta nombre'
                    } else if (!parsed.nit) {
                        parsed.error = 'Falta NIT'
                    }

                    // Clean NIT (remove dots, dashes, etc)
                    if (parsed.nit) {
                        parsed.nit = parsed.nit.replace(/[^0-9]/g, '')
                    }

                    rows.push(parsed)
                }

                setPreviewData(rows)
                setStep('preview')
            } catch (error) {
                console.error('Error parsing Excel:', error)
                alert('Error al leer el archivo. Asegúrate de que sea un archivo Excel válido.')
            }
        }
        reader.readAsArrayBuffer(file)
    }, [])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setDragActive(false)
        const file = e.dataTransfer.files?.[0]
        if (file) parseExcel(file)
    }, [parseExcel])

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) parseExcel(file)
    }

    const handleImport = async () => {
        setStep('importing')

        const validRows = previewData.filter(r => !r.error)
        const providers = validRows.map(r => ({
            name: r.name,
            nit: r.nit,
            dv: r.dv || '',
            taxType: r.taxType || 'Juridica',
            email: r.email,
            phone: r.phone,
            address: r.address,
            city: r.city,
            bankName: r.bankName,
            bankAccount: r.bankAccount,
            accountType: r.accountType,
            defaultRetefuentePerc: r.defaultRetefuentePerc ? parseFloat(r.defaultRetefuentePerc) : 0,
            defaultReteicaPerc: r.defaultReteicaPerc ? parseFloat(r.defaultReteicaPerc) : 0,
            isRecurring: r.isRecurring?.toLowerCase() === 'si' || r.isRecurring?.toLowerCase() === 'true' || r.isRecurring === '1',
            category: r.category
        }))

        try {
            const result = await bulkImportProviders(providers)
            setImportResults({
                created: result.created,
                failed: result.failed,
                errors: result.results.errors
            })
            setStep('results')
        } catch (error) {
            console.error('Import error:', error)
            setImportResults({
                created: 0,
                failed: providers.length,
                errors: [{ error: 'Error de conexión con el servidor' }]
            })
            setStep('results')
        }
    }

    const validCount = previewData.filter(r => !r.error).length
    const errorCount = previewData.filter(r => r.error).length

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between p-4 border-b">
                    <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
                        Importar Proveedores
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <div className="flex-1 overflow-auto p-4">
                    {/* Upload Step */}
                    {step === 'upload' && (
                        <div className="space-y-4">
                            <div
                                className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${dragActive ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-gray-400'
                                    }`}
                                onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
                                onDragLeave={() => setDragActive(false)}
                                onDrop={handleDrop}
                            >
                                <Upload className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                                <p className="text-gray-600 mb-2">Arrastra un archivo Excel aquí</p>
                                <p className="text-sm text-gray-400 mb-4">o</p>
                                <label className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 cursor-pointer">
                                    Seleccionar Archivo
                                    <input
                                        type="file"
                                        accept=".xlsx,.xls,.csv"
                                        className="hidden"
                                        onChange={handleFileChange}
                                    />
                                </label>
                            </div>

                            <div className="bg-gray-50 rounded-lg p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="font-medium text-gray-700">Formato esperado:</h4>
                                    <button
                                        onClick={() => {
                                            const templateData = [
                                                ['Nombre', 'NIT', 'DV', 'Tipo', 'Email', 'Teléfono', 'Dirección', 'Ciudad', 'Banco', 'Cuenta', 'Tipo Cuenta', '% Retefuente', '% ReteICA', 'Recurrente', 'Categoría'],
                                                ['EPM Empresas Públicas', '890904996', '4', 'Juridica', 'info@epm.com.co', '6044444444', 'Cra 58 #42-125', 'Medellín', 'Bancolombia', '12345678901', 'Corriente', '2.5', '0.0069', 'Si', 'Servicios Públicos'],
                                                ['Vigilancia ABC', '900123456', '1', 'Juridica', 'contacto@vigilancia.com', '3001234567', 'Calle 10 #20-30', 'Medellín', 'Davivienda', '98765432101', 'Ahorros', '4', '0.0069', 'Si', 'Vigilancia'],
                                                ['Juan Pérez', '1017123456', '0', 'Persona Natural', 'juan@email.com', '3009876543', 'Cra 70 #45-12', 'Bogotá', '', '', '', '0', '0', 'No', 'Mantenimiento']
                                            ]
                                            const ws = XLSX.utils.aoa_to_sheet(templateData)
                                            const wb = XLSX.utils.book_new()
                                            XLSX.utils.book_append_sheet(wb, ws, 'Proveedores')
                                            XLSX.writeFile(wb, 'plantilla_proveedores.xlsx')
                                        }}
                                        className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 flex items-center gap-1"
                                    >
                                        <FileSpreadsheet className="w-3.5 h-3.5" />
                                        Descargar Plantilla
                                    </button>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="text-xs w-full">
                                        <thead>
                                            <tr className="bg-gray-100">
                                                <th className="px-2 py-1 text-left">Nombre</th>
                                                <th className="px-2 py-1 text-left">NIT</th>
                                                <th className="px-2 py-1 text-left">Tipo</th>
                                                <th className="px-2 py-1 text-left">Email</th>
                                                <th className="px-2 py-1 text-left">Teléfono</th>
                                                <th className="px-2 py-1 text-left">Ciudad</th>
                                                <th className="px-2 py-1 text-left">Banco</th>
                                                <th className="px-2 py-1 text-left">Cuenta</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr className="text-gray-500">
                                                <td className="px-2 py-1">EPM Empresas...</td>
                                                <td className="px-2 py-1">890904996</td>
                                                <td className="px-2 py-1">Juridica</td>
                                                <td className="px-2 py-1">info@epm.com</td>
                                                <td className="px-2 py-1">604444...</td>
                                                <td className="px-2 py-1">Medellín</td>
                                                <td className="px-2 py-1">Bancolombia</td>
                                                <td className="px-2 py-1">123456...</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                                <p className="text-xs text-gray-500 mt-2">
                                    <strong>Requeridos:</strong> Nombre, NIT • <strong>Opcionales:</strong> Tipo, Email, Teléfono, Ciudad, Banco, Cuenta
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Preview Step */}
                    {step === 'preview' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <span className="text-sm text-gray-600">
                                        <span className="font-semibold text-emerald-600">{validCount}</span> válidos
                                    </span>
                                    {errorCount > 0 && (
                                        <span className="text-sm text-gray-600">
                                            <span className="font-semibold text-red-600">{errorCount}</span> con errores
                                        </span>
                                    )}
                                </div>
                                <button
                                    onClick={() => { setStep('upload'); setPreviewData([]) }}
                                    className="text-sm text-indigo-600 hover:text-indigo-700"
                                >
                                    Cambiar archivo
                                </button>
                            </div>

                            <div className="border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 sticky top-0">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-medium text-gray-500">#</th>
                                            <th className="px-3 py-2 text-left font-medium text-gray-500">Nombre</th>
                                            <th className="px-3 py-2 text-left font-medium text-gray-500">NIT</th>
                                            <th className="px-3 py-2 text-left font-medium text-gray-500">Tipo</th>
                                            <th className="px-3 py-2 text-left font-medium text-gray-500">Email</th>
                                            <th className="px-3 py-2 text-left font-medium text-gray-500">Estado</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {previewData.map((row) => (
                                            <tr key={row.index} className={row.error ? 'bg-red-50' : ''}>
                                                <td className="px-3 py-2 text-gray-400">{row.index}</td>
                                                <td className="px-3 py-2 font-medium">{row.name || '-'}</td>
                                                <td className="px-3 py-2 font-mono">{row.nit || '-'}</td>
                                                <td className="px-3 py-2">{row.taxType || '-'}</td>
                                                <td className="px-3 py-2">{row.email || '-'}</td>
                                                <td className="px-3 py-2">
                                                    {row.error ? (
                                                        <span className="flex items-center gap-1 text-red-600">
                                                            <AlertCircle className="w-4 h-4" />
                                                            {row.error}
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center gap-1 text-emerald-600">
                                                            <CheckCircle className="w-4 h-4" />
                                                            OK
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Importing Step */}
                    {step === 'importing' && (
                        <div className="py-12 text-center">
                            <Loader2 className="w-12 h-12 mx-auto text-indigo-600 animate-spin mb-4" />
                            <p className="text-gray-600">Importando {validCount} proveedores...</p>
                        </div>
                    )}

                    {/* Results Step */}
                    {step === 'results' && importResults && (
                        <div className="space-y-4">
                            <div className="text-center py-6">
                                {importResults.created > 0 ? (
                                    <CheckCircle className="w-16 h-16 mx-auto text-emerald-500 mb-4" />
                                ) : (
                                    <AlertCircle className="w-16 h-16 mx-auto text-red-500 mb-4" />
                                )}
                                <h3 className="text-xl font-semibold text-gray-900">
                                    {importResults.created > 0 ? 'Importación Completada' : 'Error en Importación'}
                                </h3>
                                <p className="text-gray-600 mt-2">
                                    <span className="text-emerald-600 font-semibold">{importResults.created}</span> creados
                                    {importResults.failed > 0 && (
                                        <>, <span className="text-red-600 font-semibold">{importResults.failed}</span> fallidos</>
                                    )}
                                </p>
                            </div>

                            {importResults.errors.length > 0 && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                    <h4 className="font-medium text-red-800 mb-2">Errores:</h4>
                                    <ul className="text-sm text-red-700 space-y-1">
                                        {importResults.errors.slice(0, 10).map((err, i) => (
                                            <li key={i}>
                                                {err.nit && <span className="font-mono">{err.nit}:</span>} {err.error}
                                            </li>
                                        ))}
                                        {importResults.errors.length > 10 && (
                                            <li>...y {importResults.errors.length - 10} más</li>
                                        )}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 p-4 border-t bg-gray-50">
                    {step === 'preview' && (
                        <>
                            <button
                                onClick={onClose}
                                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg text-sm font-medium"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleImport}
                                disabled={validCount === 0}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                            >
                                Importar {validCount} Proveedores
                            </button>
                        </>
                    )}
                    {step === 'results' && (
                        <button
                            onClick={() => {
                                if (importResults && importResults.created > 0) {
                                    onSuccess()
                                }
                                onClose()
                            }}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
                        >
                            Cerrar
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
