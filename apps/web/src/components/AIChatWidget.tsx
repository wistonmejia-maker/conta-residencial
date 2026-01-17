import { useState, useRef, useEffect } from 'react'
import { Send, X, Bot, User, Loader2, Minimize2, Maximize2 } from 'lucide-react'
import { API_BASE } from '../lib/api/common'
import { useUnit } from '../lib/UnitContext'

interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
    timestamp: Date
}

export function AIChatWidget() {
    const { selectedUnit } = useUnit()
    const [isOpen, setIsOpen] = useState(false)
    const [isMinimized, setIsMinimized] = useState(false)
    const [messages, setMessages] = useState<Message[]>([
        {
            id: 'welcome',
            role: 'assistant',
            content: 'Hola, soy tu CFO Virtual. ¿En qué puedo ayudarte con las finanzas de tu edificio hoy?',
            timestamp: new Date()
        }
    ])
    const [inputText, setInputText] = useState('')
    const [isLoading, setIsLoading] = useState(false)
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

    const handleSendMessage = async (e?: React.FormEvent) => {
        e?.preventDefault()
        if (!inputText.trim() || !unitId || isLoading) return

        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: inputText,
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
                                    <div className="whitespace-pre-wrap">{msg.content}</div>
                                    <span className={`text-[10px] block mt-1 ${msg.role === 'user' ? 'text-indigo-200' : 'text-gray-400'}`}>
                                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                                {msg.role === 'user' && (
                                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                                        <User className="w-4 h-4 text-gray-500" />
                                    </div>
                                )}
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

                    {/* Smart Suggestions */}
                    {messages.length <= 2 && !isLoading && (
                        <div className="px-3 py-2 bg-white border-t border-gray-100 shrink-0">
                            <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-2 font-medium">Sugerencias</p>
                            <div className="flex flex-wrap gap-1.5">
                                {[
                                    { emoji: '📊', text: '¿Cuánto gasté este mes?' },
                                    { emoji: '⚠️', text: '¿Facturas pendientes?' },
                                    { emoji: '📈', text: 'Compara gastos vs mes anterior' },
                                    { emoji: '💰', text: '¿Cuál es mi mayor gasto?' },
                                    { emoji: '🏦', text: 'Estado de cuentas por pagar' },
                                ].map((suggestion) => (
                                    <button
                                        key={suggestion.text}
                                        type="button"
                                        onClick={() => {
                                            setInputText(suggestion.text)
                                        }}
                                        className="text-xs px-2.5 py-1.5 bg-gradient-to-r from-violet-50 to-indigo-50 text-indigo-700 rounded-full border border-indigo-100 hover:from-violet-100 hover:to-indigo-100 hover:border-indigo-200 transition-all flex items-center gap-1 whitespace-nowrap"
                                    >
                                        <span>{suggestion.emoji}</span>
                                        <span>{suggestion.text}</span>
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
            )}
        </div>
    )
}
