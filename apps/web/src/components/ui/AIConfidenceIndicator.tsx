import { CheckCircle, AlertCircle, AlertTriangle } from 'lucide-react'

type ConfidenceLevel = 'high' | 'medium' | 'low'

interface AIConfidenceIndicatorProps {
    /** Confidence score from 0 to 100 */
    score?: number
    /** Or directly specify level */
    level?: ConfidenceLevel
    /** Show the percentage value */
    showScore?: boolean
    /** Size variant */
    size?: 'sm' | 'md'
}

/**
 * Confidence indicator for AI results
 * Shows green (high), yellow (medium), or red (low) based on score
 */
export function AIConfidenceIndicator({
    score,
    level: explicitLevel,
    showScore = true,
    size = 'sm'
}: AIConfidenceIndicatorProps) {
    // Determine level from score if not explicitly set
    const level: ConfidenceLevel = explicitLevel || (
        score === undefined ? 'medium' :
            score >= 90 ? 'high' :
                score >= 70 ? 'medium' : 'low'
    )

    const config = {
        high: {
            icon: CheckCircle,
            bgClass: 'ai-confidence-high',
            label: 'Alta confianza',
            emoji: '🟢'
        },
        medium: {
            icon: AlertCircle,
            bgClass: 'ai-confidence-medium',
            label: 'Media confianza',
            emoji: '🟡'
        },
        low: {
            icon: AlertTriangle,
            bgClass: 'ai-confidence-low',
            label: 'Baja confianza',
            emoji: '🔴'
        }
    }

    const { bgClass, label, emoji } = config[level]

    const sizeClasses = {
        sm: 'text-xs px-2 py-0.5',
        md: 'text-sm px-3 py-1'
    }

    return (
        <span
            className={`inline-flex items-center gap-1 rounded-full border font-medium ${bgClass} ${sizeClasses[size]}`}
            title={label}
        >
            <span>{emoji}</span>
            {showScore && score !== undefined && (
                <span>{score}%</span>
            )}
            {!showScore && (
                <span>{level === 'high' ? 'Alta' : level === 'medium' ? 'Media' : 'Baja'}</span>
            )}
        </span>
    )
}

export default AIConfidenceIndicator
