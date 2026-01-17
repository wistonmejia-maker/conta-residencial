import { Brain, Loader2 } from 'lucide-react'

interface AIProcessingOverlayProps {
    /** Whether the overlay is visible */
    visible: boolean
    /** Main message to display */
    message?: string
    /** Sub-message or current step */
    subMessage?: string
    /** Progress percentage (0-100), if known */
    progress?: number
    /** Estimated time remaining in seconds */
    estimatedTime?: number
}

/**
 * Full-screen overlay for AI processing states
 * Provides visual feedback during long-running AI operations
 */
export function AIProcessingOverlay({
    visible,
    message = 'Procesando con IA...',
    subMessage,
    progress,
    estimatedTime
}: AIProcessingOverlayProps) {
    if (!visible) return null

    return (
        <div className="ai-processing animate-fade-in">
            <div className="ai-processing-card">
                {/* Animated brain icon */}
                <div className="relative">
                    <div className="w-16 h-16 rounded-2xl ai-gradient flex items-center justify-center shadow-lg">
                        <Brain className="w-8 h-8 text-white ai-pulse" />
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-white rounded-full flex items-center justify-center shadow-md">
                        <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                    </div>
                </div>

                {/* Main message */}
                <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-gray-900">{message}</h3>
                    {subMessage && (
                        <p className="text-sm text-gray-500">{subMessage}</p>
                    )}
                </div>

                {/* Progress bar (if provided) */}
                {progress !== undefined && (
                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div
                            className="h-full ai-gradient transition-all duration-300"
                            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                        />
                    </div>
                )}

                {/* Estimated time */}
                {estimatedTime !== undefined && estimatedTime > 0 && (
                    <p className="text-xs text-gray-400">
                        Tiempo estimado: ~{estimatedTime < 60 ? `${estimatedTime}s` : `${Math.ceil(estimatedTime / 60)}min`}
                    </p>
                )}

                {/* Animated dots indicator */}
                <div className="ai-loading-dots flex gap-1 text-indigo-400">
                    <span className="w-2 h-2 rounded-full bg-current"></span>
                    <span className="w-2 h-2 rounded-full bg-current"></span>
                    <span className="w-2 h-2 rounded-full bg-current"></span>
                </div>
            </div>
        </div>
    )
}

export default AIProcessingOverlay
