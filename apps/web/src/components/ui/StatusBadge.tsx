import { CheckCircle2, Clock, AlertCircle, XCircle } from 'lucide-react'

interface StatusBadgeProps {
    status: string
    size?: 'sm' | 'md'
    showIcon?: boolean
}

const STATUS_CONFIG: Record<string, {
    label: string
    className: string
    icon: typeof CheckCircle2
}> = {
    // Payment statuses
    DRAFT: { label: 'Borrador', className: 'status-pending', icon: Clock },
    PAID_NO_SUPPORT: { label: 'Sin Soporte', className: 'status-error', icon: AlertCircle },
    COMPLETED: { label: 'Pagado', className: 'status-paid', icon: CheckCircle2 },
    CONCILIATED: { label: 'Conciliado', className: 'status-conciliated', icon: CheckCircle2 },

    // Invoice statuses
    PENDING: { label: 'Pendiente', className: 'status-pending', icon: Clock },
    PAID: { label: 'Pagada', className: 'status-paid', icon: CheckCircle2 },
    PARTIALLY_PAID: { label: 'Pago Parcial', className: 'status-conciliated', icon: AlertCircle },

    // Provider statuses
    ACTIVE: { label: 'Activo', className: 'status-paid', icon: CheckCircle2 },
    INACTIVE: { label: 'Inactivo', className: 'status-error', icon: XCircle },
}

export function StatusBadge({ status, size = 'md', showIcon = true }: StatusBadgeProps) {
    const config = STATUS_CONFIG[status] || {
        label: status,
        className: 'status-pending',
        icon: Clock
    }

    const Icon = config.icon
    const sizeClasses = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-xs px-2.5 py-1'

    return (
        <span className={`status-pill ${config.className} ${sizeClasses}`}>
            {showIcon && <Icon className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />}
            {config.label}
        </span>
    )
}

export default StatusBadge
