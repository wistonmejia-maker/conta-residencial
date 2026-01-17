import { Sparkles, Loader2 } from 'lucide-react'
import type { ReactNode, ButtonHTMLAttributes } from 'react'

interface AIButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    /** Loading state - shows spinner and applies sparkle animation */
    loading?: boolean
    /** Button variant */
    variant?: 'primary' | 'secondary' | 'ghost'
    /** Size variant */
    size?: 'sm' | 'md' | 'lg'
    /** Custom icon to replace Sparkles */
    icon?: ReactNode
    /** Hide icon completely */
    hideIcon?: boolean
    /** Children content */
    children: ReactNode
}

/**
 * Unified AI Button component with consistent styling
 * Uses the AI visual system defined in index.css
 */
export function AIButton({
    loading = false,
    variant = 'primary',
    size = 'md',
    icon,
    hideIcon = false,
    children,
    className = '',
    disabled,
    ...props
}: AIButtonProps) {
    const baseClasses = 'inline-flex items-center justify-center gap-2 font-medium transition-all'

    const variantClasses = {
        primary: 'ai-button',
        secondary: 'ai-button-secondary',
        ghost: 'ai-icon-button'
    }

    const sizeClasses = {
        sm: 'text-xs py-1.5 px-3',
        md: 'text-sm py-2 px-4',
        lg: 'text-base py-3 px-6'
    }

    const iconSizes = {
        sm: 'w-3 h-3',
        md: 'w-4 h-4',
        lg: 'w-5 h-5'
    }

    const isDisabled = disabled || loading

    const renderIcon = () => {
        if (hideIcon) return null

        if (loading) {
            return <Loader2 className={`${iconSizes[size]} animate-spin`} />
        }

        if (icon) {
            return icon
        }

        return <Sparkles className={`${iconSizes[size]} ${loading ? 'ai-sparkle' : ''}`} />
    }

    return (
        <button
            className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
            disabled={isDisabled}
            {...props}
        >
            {renderIcon()}
            {children}
        </button>
    )
}

export default AIButton
