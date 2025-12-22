import { Toaster } from 'react-hot-toast'
export { toast } from 'react-hot-toast'

/**
 * Toast configuration component - add to App.tsx
 */
export function ToastProvider() {
    return (
        <Toaster
            position="top-right"
            toastOptions={{
                duration: 4000,
                style: {
                    background: '#1e293b',
                    color: '#f8fafc',
                    borderRadius: '8px',
                    padding: '12px 16px',
                },
                success: {
                    iconTheme: {
                        primary: '#10b981',
                        secondary: '#f8fafc',
                    },
                },
                error: {
                    iconTheme: {
                        primary: '#ef4444',
                        secondary: '#f8fafc',
                    },
                },
            }}
        />
    )
}
