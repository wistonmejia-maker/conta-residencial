import { AlertTriangle, Sparkles, X } from 'lucide-react'
import type { ReactNode } from 'react'

interface AIConfirmDialogProps {
    /** Whether the dialog is open */
    open: boolean
    /** Called when the dialog should close */
    onClose: () => void
    /** Called when the user confirms the action */
    onConfirm: () => void
    /** Title of the confirmation dialog */
    title: string
    /** Description of what will happen */
    description: string
    /** Optional: Items that will be affected */
    affectedItems?: string[]
    /** Optional: Additional warning message */
    warning?: string
    /** Text for confirm button */
    confirmText?: string
    /** Text for cancel button */
    cancelText?: string
    /** Whether the action is currently processing */
    loading?: boolean
    /** Optional custom icon */
    icon?: ReactNode
}

/**
 * Confirmation dialog for critical AI actions
 * Shows a warning before allowing destructive or significant AI operations
 */
export function AIConfirmDialog({
    open,
    onClose,
    onConfirm,
    title,
    description,
    affectedItems,
    warning,
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    loading = false,
    icon
}: AIConfirmDialogProps) {
    if (!open) return null

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4 animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                {/* Header */}
                <div className="p-5 border-b border-gray-100">
                    <div className="flex items-start gap-4">
                        <div className="p-3 rounded-xl ai-gradient shadow-lg">
                            {icon || <Sparkles className="w-6 h-6 text-white" />}
                        </div>
                        <div className="flex-1">
                            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
                            <p className="text-sm text-gray-500 mt-1">{description}</p>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                            disabled={loading}
                        >
                            <X className="w-5 h-5 text-gray-400" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-5 space-y-4">
                    {/* Affected items */}
                    {affectedItems && affectedItems.length > 0 && (
                        <div className="bg-gray-50 rounded-lg p-3">
                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                                Elementos afectados ({affectedItems.length})
                            </p>
                            <ul className="space-y-1 max-h-32 overflow-y-auto">
                                {affectedItems.slice(0, 5).map((item, idx) => (
                                    <li key={idx} className="text-sm text-gray-700 flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                        {item}
                                    </li>
                                ))}
                                {affectedItems.length > 5 && (
                                    <li className="text-xs text-gray-400 italic">
                                        ... y {affectedItems.length - 5} más
                                    </li>
                                )}
                            </ul>
                        </div>
                    )}

                    {/* Warning */}
                    {warning && (
                        <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-amber-700">{warning}</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={loading}
                        className="ai-button px-5 py-2 text-sm"
                    >
                        {loading ? (
                            <>
                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Procesando...
                            </>
                        ) : (
                            confirmText
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default AIConfirmDialog
