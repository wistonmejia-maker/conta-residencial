import { useState } from 'react'
import { X, Send, MessageSquare } from 'lucide-react'
import { sendAIFeedback } from '../lib/api/index'

interface FeedbackModalProps {
    isOpen: boolean
    onClose: () => void
    unitId: string
    documentType: 'INVOICE' | 'PAYMENT'
    referenceId: string // e.g. invoiceId or paymentId
    defaultValue?: string
}

export function FeedbackModal({ isOpen, onClose, unitId, documentType, referenceId }: FeedbackModalProps) {
    const [comment, setComment] = useState('')
    const [sending, setSending] = useState(false)

    if (!isOpen) return null

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!comment.trim()) return

        setSending(true)
        try {
            await sendAIFeedback({
                unitId,
                documentType,
                referenceId,
                comment: comment,
                invoiceId: documentType === 'INVOICE' ? referenceId : undefined,
                paymentId: documentType === 'PAYMENT' ? referenceId : undefined
            })
            alert('¡Gracias! Tu comentario ayudará a entrenar a la IA.')
            onClose()
            setComment('')
        } catch (error) {
            console.error('Error sending feedback:', error)
            alert('Error al enviar comentario')
        } finally {
            setSending(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4 animate-fade-in">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 text-indigo-600" />
                        Comentario / Corrección IA
                    </h3>
                    <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full transition-colors">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5">
                    <p className="text-sm text-gray-600 mb-3">
                        ¿La IA clasificó mal este documento? ¿Falta algún dato?
                        Escribe tu corrección aquí para que el sistema aprenda.
                    </p>

                    <textarea
                        className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-h-[100px]"
                        placeholder="Ej: Esto no es una factura, es un comprobante de egreso..."
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        autoFocus
                    />

                    <div className="flex justify-end gap-3 mt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-gray-600 text-sm font-medium hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={!comment.trim() || sending}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            {sending ? 'Enviando...' : (
                                <>
                                    <Send className="w-4 h-4" />
                                    Enviar Comentario
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
