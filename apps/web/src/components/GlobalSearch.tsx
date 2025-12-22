import { useState, useRef, useEffect } from 'react'
import { Search, User, FileText, CreditCard, X, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useUnit } from '../lib/UnitContext'

const API_BASE = '/api'

interface SearchResult {
    type: 'provider' | 'invoice' | 'payment'
    id: string
    title: string
    subtitle: string
    url: string
}

async function globalSearch(query: string, unitId?: string): Promise<{ results: SearchResult[] }> {
    const params = new URLSearchParams({ q: query })
    if (unitId) params.append('unitId', unitId)
    const res = await fetch(`${API_BASE}/search?${params}`)
    return res.json()
}

const typeIcons = {
    provider: User,
    invoice: FileText,
    payment: CreditCard
}

const typeLabels = {
    provider: 'Proveedor',
    invoice: 'Factura',
    payment: 'Pago'
}

export default function GlobalSearch() {
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<SearchResult[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [isOpen, setIsOpen] = useState(false)
    const { selectedUnit } = useUnit()
    const navigate = useNavigate()
    const containerRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    // Debounced search
    useEffect(() => {
        if (query.length < 2) {
            setResults([])
            return
        }

        const timer = setTimeout(async () => {
            setIsLoading(true)
            try {
                const data = await globalSearch(query, selectedUnit?.id)
                setResults(data.results || [])
                setIsOpen(true)
            } catch (error) {
                console.error('Search error:', error)
                setResults([])
            } finally {
                setIsLoading(false)
            }
        }, 300)

        return () => clearTimeout(timer)
    }, [query, selectedUnit?.id])

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const handleSelect = (result: SearchResult) => {
        setQuery('')
        setIsOpen(false)
        navigate(result.url)
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            setIsOpen(false)
            inputRef.current?.blur()
        }
    }

    return (
        <div ref={containerRef} className="relative w-full max-w-md">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onFocus={() => query.length >= 2 && setIsOpen(true)}
                    onKeyDown={handleKeyDown}
                    placeholder="Buscar proveedores, facturas, pagos..."
                    className="w-full pl-10 pr-10 py-2 bg-gray-100 border-0 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500 transition-colors"
                />
                {isLoading && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
                )}
                {!isLoading && query && (
                    <button
                        onClick={() => { setQuery(''); setResults([]); setIsOpen(false) }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Results dropdown */}
            {isOpen && (query.length >= 2) && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden z-50 max-h-80 overflow-y-auto">
                    {results.length === 0 ? (
                        <div className="p-4 text-center text-gray-500 text-sm">
                            {isLoading ? 'Buscando...' : 'No se encontraron resultados'}
                        </div>
                    ) : (
                        <ul>
                            {results.map(result => {
                                const Icon = typeIcons[result.type]
                                return (
                                    <li key={`${result.type}-${result.id}`}>
                                        <button
                                            onClick={() => handleSelect(result)}
                                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left transition-colors"
                                        >
                                            <div className={`p-2 rounded-lg ${result.type === 'provider' ? 'bg-blue-100 text-blue-600' :
                                                    result.type === 'invoice' ? 'bg-amber-100 text-amber-600' :
                                                        'bg-green-100 text-green-600'
                                                }`}>
                                                <Icon className="w-4 h-4" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-gray-900 truncate">{result.title}</p>
                                                <p className="text-xs text-gray-500 truncate">{result.subtitle}</p>
                                            </div>
                                            <span className="text-xs text-gray-400 flex-shrink-0">
                                                {typeLabels[result.type]}
                                            </span>
                                        </button>
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </div>
            )}
        </div>
    )
}
