import { useState, useEffect } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Users, FileText, CreditCard, GitCompare, FileSpreadsheet, Building2, RefreshCw, ChevronDown, Loader2, BarChart3, Menu, X, Calculator } from 'lucide-react'
import { useUnit } from '../lib/UnitContext'
import GlobalSearch from './GlobalSearch'
import { AIChatWidget } from './AIChatWidget'

const operationalItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/invoices', icon: FileText, label: 'Facturas' },
    { to: '/payments', icon: CreditCard, label: 'Egresos' },
    { to: '/conciliation', icon: GitCompare, label: 'Conciliación' },
    { to: '/closure', icon: FileSpreadsheet, label: 'Cierre Mensual' },
    { to: '/reports', icon: BarChart3, label: 'Reportes' },
    { to: '/budget', icon: Calculator, label: 'Presupuesto' },
]

const configItems = [
    { to: '/providers', icon: Users, label: 'Proveedores' },
    { to: '/recurrence', icon: RefreshCw, label: 'Recurrentes' },
]

// Bottom nav items for mobile (most important actions)
const bottomNavItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Inicio' },
    { to: '/invoices', icon: FileText, label: 'Facturas' },
    { to: '/payments', icon: CreditCard, label: 'Egresos' },
    { to: '/providers', icon: Users, label: 'Proveedores' },
]

const publicPaths = ['/units', '/providers']

export default function AppLayout() {
    const { units, selectedUnit, setSelectedUnit, isLoading } = useUnit()
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const location = useLocation()
    const navigate = useNavigate()

    // Close sidebar on route change (mobile)
    useEffect(() => {
        setSidebarOpen(false)
    }, [location.pathname])

    // Close sidebar on window resize if becoming desktop
    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth >= 768) {
                setSidebarOpen(false)
            }
        }
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    // Protect routes
    useEffect(() => {
        if (isLoading) return

        const currentPath = location.pathname

        // Check if path is public
        const isPublic = publicPaths.some(p => currentPath === p || currentPath.startsWith(p + '/'))

        // If not public and no unit selected, redirect to units
        if (!selectedUnit && !isPublic) {
            navigate('/units')
        }
    }, [isLoading, selectedUnit, location.pathname, navigate])

    const isLinkEnabled = (path: string) => {
        if (publicPaths.some(p => path === p || path.startsWith(p + '/'))) return true
        return !!selectedUnit
    }

    const handleLinkClick = (e: React.MouseEvent, path: string) => {
        if (!isLinkEnabled(path)) {
            e.preventDefault()
        }
    }

    return (
        <div className="min-h-screen flex bg-slate-50">
            {/* Mobile Overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 md:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar - Hidden on mobile by default, slides in when open */}
            <aside className={`
                fixed md:static inset-y-0 left-0 z-50
                w-64 bg-white border-r border-gray-200 flex flex-col
                transform transition-transform duration-300 ease-in-out
                ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
            `}>
                {/* Logo */}
                <div className="h-16 flex items-center justify-between px-6 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-sm">
                            CR
                        </div>
                        <div>
                            <h1 className="font-bold text-gray-900 text-sm">ContaResidencial</h1>
                            <p className="text-[10px] text-gray-400 font-medium">Administraciones LC</p>
                        </div>
                    </div>
                    {/* Close button - mobile only */}
                    <button
                        onClick={() => setSidebarOpen(false)}
                        className="md:hidden p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 p-4 space-y-6 overflow-y-auto">
                    {/* Operational Section */}
                    <div className="space-y-1">
                        <p className="px-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Operación</p>
                        {operationalItems.map(item => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                onClick={(e) => handleLinkClick(e, item.to)}
                                className={({ isActive }) =>
                                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${!isLinkEnabled(item.to)
                                        ? 'opacity-40 cursor-not-allowed hover:bg-transparent text-gray-400'
                                        : isActive
                                            ? 'bg-indigo-50 text-indigo-700 shadow-sm'
                                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                    }`
                                }
                            >
                                <item.icon className="w-5 h-5" strokeWidth={1.5} />
                                {item.label}
                            </NavLink>
                        ))}
                    </div>

                    {/* Config Section */}
                    <div className="space-y-1">
                        <p className="px-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Gestión</p>
                        {configItems.map(item => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                onClick={(e) => handleLinkClick(e, item.to)}
                                className={({ isActive }) =>
                                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${!isLinkEnabled(item.to)
                                        ? 'opacity-40 cursor-not-allowed hover:bg-transparent text-gray-400'
                                        : isActive
                                            ? 'bg-indigo-50 text-indigo-700 shadow-sm'
                                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                    }`
                                }
                            >
                                <item.icon className="w-5 h-5" strokeWidth={1.5} />
                                {item.label}
                            </NavLink>
                        ))}
                    </div>
                </nav>

                {/* Units Management */}
                <div className="p-4 border-t border-gray-100">
                    <NavLink
                        to="/units"
                        className={({ isActive }) =>
                            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium w-full transition-all ${isActive
                                ? 'bg-indigo-50 text-indigo-700 shadow-sm'
                                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                            }`
                        }
                    >
                        <Building2 className="w-5 h-5" strokeWidth={1.5} />
                        Unidades
                    </NavLink>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden pb-16 md:pb-0">
                {/* TopBar */}
                <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-6">
                    {/* Hamburger Menu - Mobile Only */}
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="md:hidden p-2 -ml-2 rounded-lg hover:bg-gray-100 text-gray-600"
                    >
                        <Menu className="w-6 h-6" />
                    </button>

                    {/* Search - Hidden on small mobile */}
                    <div className="hidden sm:block flex-1 max-w-xl">
                        {selectedUnit ? <GlobalSearch /> : <div />}
                    </div>

                    <div className="flex items-center gap-2 md:gap-4">
                        {isLoading ? (
                            <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span className="hidden sm:inline">Cargando...</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 md:gap-3 md:pl-4 md:border-l border-gray-100">
                                {selectedUnit?.logoUrl && (
                                    <div className="w-8 h-8 rounded-lg overflow-hidden border border-gray-100 bg-white flex-shrink-0 shadow-sm hidden md:flex items-center justify-center">
                                        <img
                                            src={selectedUnit.logoUrl}
                                            alt={selectedUnit.name}
                                            className="w-full h-full object-contain p-0.5"
                                        />
                                    </div>
                                )}
                                <div className="relative group">
                                    <select
                                        value={selectedUnit?.id || ''}
                                        onChange={(e) => {
                                            const unit = units.find(u => u.id === e.target.value)
                                            if (unit) setSelectedUnit(unit)
                                        }}
                                        className="appearance-none pl-2 md:pl-3 pr-7 md:pr-9 py-2 text-xs md:text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-700 font-semibold cursor-pointer hover:bg-gray-100 hover:border-gray-300 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/10 min-w-[120px] md:min-w-[200px]"
                                    >
                                        <option value="" disabled>Seleccionar Unidad</option>
                                        {units.map(unit => (
                                            <option key={unit.id} value={unit.id}>{unit.name}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-2 md:right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none group-hover:text-gray-600 transition-colors" />
                                </div>
                            </div>
                        )}
                        <div className="w-8 h-8 md:w-9 md:h-9 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-semibold text-xs md:text-sm">
                            LC
                        </div>
                    </div>
                </header>

                {/* Page Content */}
                <div className="flex-1 overflow-auto p-4 md:p-6">
                    <Outlet />
                </div>
            </main>

            {/* Bottom Navigation - Mobile Only */}
            <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 md:hidden z-30">
                <div className="flex justify-around items-center h-16">
                    {bottomNavItems.map(item => {
                        const isActive = location.pathname === item.to
                        return (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                onClick={(e) => handleLinkClick(e, item.to)}
                                className={`flex flex-col items-center justify-center flex-1 h-full py-2 transition-colors ${!isLinkEnabled(item.to)
                                    ? 'opacity-40 cursor-not-allowed text-gray-300'
                                    : isActive
                                        ? 'text-indigo-600'
                                        : 'text-gray-500'
                                    }`}
                            >
                                <item.icon className="w-5 h-5 mb-1" strokeWidth={isActive ? 2 : 1.5} />
                                <span className="text-[10px] font-medium">{item.label}</span>
                            </NavLink>
                        )
                    })}
                    {/* More menu */}
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="flex flex-col items-center justify-center flex-1 h-full py-2 text-gray-500"
                    >
                        <Menu className="w-5 h-5 mb-1" strokeWidth={1.5} />
                        <span className="text-[10px] font-medium">Más</span>
                    </button>
                </div>
            </nav >
            <AIChatWidget />
        </div >
    )
}
