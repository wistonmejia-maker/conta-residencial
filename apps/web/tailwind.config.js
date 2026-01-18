/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                brand: {
                    50: '#eff6ff',
                    100: '#dbeafe',
                    200: '#bfdbfe',
                    300: '#93c5fd',
                    400: '#60a5fa',
                    500: '#3b82f6', // Primary Blue
                    600: '#2563eb',
                    700: '#1d4ed8',
                    800: '#1e40af',
                    900: '#1e3a8a',
                    950: '#172554',
                    primary: '#2563eb', // Default Brand Primary
                    secondary: '#1e293b', // Slate 800
                    accent: '#14b8a6', // Teal 500
                    surface: '#ffffff',
                    background: '#f8fafc', // Slate 50
                }
            },
            borderRadius: {
                'card': '12px',
                'button': '8px',
                'input': '8px',
            },
            boxShadow: {
                'card': '0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05)',
                'card-hover': '0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -2px rgb(0 0 0 / 0.04)',
            }
        },
    },
    plugins: [],
}
