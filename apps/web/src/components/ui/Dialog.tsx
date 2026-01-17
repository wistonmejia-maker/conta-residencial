import * as React from "react"


const Dialog = ({ open, onOpenChange, children }: { open: boolean, onOpenChange: (open: boolean) => void, children: React.ReactNode }) => {
    if (!open) return null
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            {/* Backdrop click to close */}
            <div className="absolute inset-0" onClick={() => onOpenChange(false)} />
            <div className="relative z-50">{children}</div>
        </div>
    )
}

const DialogContent = ({ children, className }: { children: React.ReactNode, className?: string }) => {
    return (
        <div className={`bg-white rounded-lg shadow-lg w-full p-6 animate-in zoom-in-95 duration-200 ${className}`}>
            {children}
            {/* Close button would go here if needed, but we used backdrop */}
        </div>
    )
}

const DialogHeader = ({ children }: { children: React.ReactNode }) => (
    <div className="mb-4 text-left">{children}</div>
)

const DialogTitle = ({ children, className }: { children: React.ReactNode, className?: string }) => (
    <h2 className={`text-lg font-semibold leading-none tracking-tight ${className}`}>{children}</h2>
)

const DialogDescription = ({ children, className }: { children: React.ReactNode, className?: string }) => (
    <p className={`text-sm text-gray-500 mt-1.5 ${className}`}>{children}</p>
)

export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription }
