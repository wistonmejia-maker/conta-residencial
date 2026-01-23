import { useState, useRef, useEffect } from 'react'
import { Send, X, Bot, User, Loader2, Minimize2, Maximize2, RotateCcw } from 'lucide-react'
import { API_BASE } from '../lib/api/common'
import { useUnit } from '../lib/UnitContext'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
    timestamp: Date
}

const INITIAL_MESSAGE: Message = {
    id: 'welcome',
    role: 'assistant',
    content: 'Hola, soy tu CFO Virtual. ¿En qué puedo ayudarte con las finanzas de tu edificio hoy?',
    timestamp: new Date()
}

export function AIChatWidget() {
    const { selectedUnit } = useUnit()
    const [isOpen, setIsOpen] = useState(false)
    const [isMinimized, setIsMinimized] = useState(false)
    const [showResetConfirm, setShowResetConfirm] = useState(false)
    const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE])
    const [inputText, setInputText] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [suggestions, setSuggestions] = useState<string[]>([])
    const messagesEndRef = useRef<HTMLDivElement>(null)

    const unitId = selectedUnit?.id

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    useEffect(() => {
        if (isOpen && !isMinimized) {
            scrollToBottom()
        }
    }, [messages, isOpen, isMinimized])

    // Load suggestions on open
    const loadSuggestions = () => {
        if (unitId) {
            fetch(`${API_BASE}/ai/suggestions?unitId=${unitId}`)
                .then(res => res.json())
                .then(data => {
                    if (data.suggestions) setSuggestions(data.suggestions)
                })
                .catch(err => console.error(err))
        }
    }

    useEffect(() => {
        if (isOpen && unitId && messages.length === 1) {
            loadSuggestions()
        }
    }, [isOpen, unitId])

    const handleReset = () => {
        setMessages([{ ...INITIAL_MESSAGE, timestamp: new Date() }])
        setInputText('')
        setShowResetConfirm(false)
        loadSuggestions()
    }

    const handleSendMessage = async (e?: React.FormEvent, manualText?: string) => {
        e?.preventDefault()
        const textToSend = manualText || inputText
        if (!textToSend.trim() || !unitId || isLoading) return

        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: textToSend,
            timestamp: new Date()
        }

        setMessages(prev => [...prev, userMsg])
        setInputText('')
        setIsLoading(true)

        try {
            const res = await fetch(`${API_BASE}/ai/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ unitId, message: userMsg.content })
            })

            if (!res.ok) throw new Error('Error connecting to AI')

            const data = await res.json()

            const aiMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: data.answer,
                timestamp: new Date()
            }

            setMessages(prev => [...prev, aiMsg])
            if (data.suggestions && Array.isArray(data.suggestions)) {
                setSuggestions(data.suggestions)
            }
        } catch (error) {
            console.error(error)
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'assistant',
                content: 'Lo siento, tuve un problema analizando tus datos. Por favor intenta de nuevo.',
                timestamp: new Date()
            }])
        } finally {
            setIsLoading(false)
        }
    }

    if (!unitId) return null // Don't show if no unit selected

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 right-6 p-4 ai-gradient text-white rounded-full shadow-lg hover:shadow-xl transition-all z-50 flex items-center gap-2 group ai-pulse"
                title="Asistente Financiero (IA)"
            >
                <Bot className="w-6 h-6" />
                <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-300 ease-out whitespace-nowrap font-medium">CFO Virtual</span>
            </button>
        )
    }


    return (
        <>
            <div
                className={`fixed bottom-6 right-6 bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden z-50 transition-all duration-300 flex flex-col ${isMinimized ? 'w-72 h-14' : 'w-80 sm:w-96 h-[500px]'}`}
            >
                {/* Header */}
                <div className="bg-indigo-600 p-4 flex items-center justify-between text-white shrink-0 cursor-pointer" onClick={() => !isMinimized && setIsMinimized(true)}>
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-white/20 rounded-lg">
                            <Bot className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-sm">CFO Virtual</h3>
                            {!isMinimized && <p className="text-[10px] text-indigo-200">Impulsado por Gemini 2.0</p>}
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        {!isMinimized && messages.length > 1 && (
                            <button
                                onClick={(e) => { e.stopPropagation(); setShowResetConfirm(true) }}
                                className="p-1 hover:bg-white/10 rounded"
                                title="Reiniciar chat"
                            >
                                <RotateCcw className="w-4 h-4" />
                            </button>
                        )}
                        <button
                            onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized) }}
                            className="p-1 hover:bg-white/10 rounded"
                        >
                            {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); setIsOpen(false) }}
                            className="p-1 hover:bg-white/10 rounded"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Chat Area */}
                {!isMinimized && (
                    <>
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
                            {messages.map((msg) => (
                                <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    {msg.role === 'assistant' && (
                                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 border border-indigo-200">
                                            <Bot className="w-4 h-4 text-indigo-600" />
                                        </div>
                                    )}
                                    <div
                                        className={`relative max-w-[80%] p-3 text-sm rounded-2xl ${msg.role === 'user'
                                            ? 'bg-indigo-600 text-white rounded-tr-none'
                                            : 'bg-white text-gray-700 border border-gray-200 rounded-tl-none shadow-sm'
                                            }`}
                                    >
                                        <div className="chat-markdown">
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                {msg.content}
                                            </ReactMarkdown>
                                        </div>
                                        <span className={`text-[10px] block mt-1 ${msg.role === 'user' ? 'text-indigo-200' : 'text-gray-400'}`}>
                                            {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    {
                                        msg.role === 'user' && (
                                            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                                                <User className="w-4 h-4 text-gray-500" />
                                            </div>
                                        )
                                    }
                                </div>
                            ))}
                            {isLoading && (
                                <div className="flex gap-3 justify-start">
                                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 border border-indigo-200">
                                        <Bot className="w-4 h-4 text-indigo-600" />
                                    </div>
                                    <div className="bg-white p-4 rounded-2xl rounded-tl-none border border-gray-200 shadow-sm flex items-center gap-2">
                                        <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
                                        <span className="text-xs text-gray-400">Analizando datos financieros...</span>
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Smart Suggestions (Persistent) */}
                        {!isLoading && suggestions.length > 0 && (
                            <div className="px-3 py-2 bg-white border-t border-gray-100 shrink-0">
                                <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-2 font-medium">Sugerencias {messages.length > 1 && '(Dinámicas)'}</p>
                                <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                                    {suggestions.map((text) => (
                                        <button
                                            key={text}
                                            type="button"
                                            onClick={() => {
                                                handleSendMessage(undefined, text)
                                            }}
                                            className="text-xs px-2.5 py-1.5 bg-gradient-to-r from-violet-50 to-indigo-50 text-indigo-700 rounded-full border border-indigo-100 hover:from-violet-100 hover:to-indigo-100 hover:border-indigo-200 transition-all flex items-center gap-1 whitespace-nowrap"
                                        >
                                            <span>💡</span>
                                            <span>{text}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Input Area */}
                        <form onSubmit={handleSendMessage} className="p-3 bg-white border-t border-gray-200 shrink-0">
                            <div className="relative flex items-center">
                                <input
                                    type="text"
                                    value={inputText}
                                    onChange={(e) => setInputText(e.target.value)}
                                    placeholder="Pregunta sobre gastos, facturas..."
                                    className="w-full pl-4 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-sm"
                                    disabled={isLoading}
                                />
                                <button
                                    type="submit"
                                    disabled={!inputText.trim() || isLoading}
                                    className="absolute right-2 p-2 ai-gradient text-white rounded-lg hover:shadow-md disabled:opacity-50 transition-all shadow-sm"
                                >
                                    <Send className="w-4 h-4" />
                                </button>
                            </div>
                        </form>

                    </>
                )
                }
            </div >

            {/* Reset Confirmation Modal */}
            {showResetConfirm && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowResetConfirm(false)} />
                    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xs animate-scale-in overflow-hidden">
                        <div className="p-6 text-center">
                            <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                <RotateCcw className="w-6 h-6" />
                            </div>
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">¿Reiniciar chat?</h3>
                            <p className="text-sm text-gray-500">
                                Se borrará el historial de esta conversación y volverás al inicio.
                            </p>
                        </div>
                        <div className="flex border-t border-gray-100">
                            <button
                                onClick={() => setShowResetConfirm(false)}
                                className="flex-1 px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleReset}
                                className="flex-1 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors border-l border-gray-100"
                            >
                                Reiniciar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
