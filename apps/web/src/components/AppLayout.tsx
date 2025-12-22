import { Outlet, NavLink } from 'react-router-dom'
import { LayoutDashboard, Users, FileText, CreditCard, GitCompare, FileSpreadsheet, Building2, RefreshCw, ChevronDown, Loader2, BarChart3 } from 'lucide-react'
import { useUnit } from '../lib/UnitContext'
import GlobalSearch from './GlobalSearch'

const operationalItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/invoices', icon: FileText, label: 'Facturas' },
    { to: '/payments', icon: CreditCard, label: 'Egresos' },
    { to: '/conciliation', icon: GitCompare, label: 'Conciliación' },
    { to: '/closure', icon: FileSpreadsheet, label: 'Cierre Mensual' },
    { to: '/reports', icon: BarChart3, label: 'Reportes' },
]

const configItems = [
    { to: '/providers', icon: Users, label: 'Proveedores' },
    { to: '/recurrence', icon: RefreshCw, label: 'Recurrentes' },
]

export default function AppLayout() {
    const { units, selectedUnit, setSelectedUnit, isLoading } = useUnit()

    return (
        <div className="min-h-screen flex bg-slate-50">
            {/* Sidebar */}
            <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
                {/* Logo */}
                <div className="h-16 flex items-center px-6 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-sm">
                            CR
                        </div>
                        <div>
                            <h1 className="font-bold text-gray-900 text-sm">ContaResidencial</h1>
                            <p className="text-[10px] text-gray-400 font-medium">Administraciones LC</p>
                        </div>
                    </div>
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
                                className={({ isActive }) =>
                                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${isActive
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
                                className={({ isActive }) =>
                                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${isActive
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
            <main className="flex-1 flex flex-col overflow-hidden">
                {/* TopBar */}
                <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
                    <GlobalSearch />
                    <div className="flex items-center gap-4">
                        {isLoading ? (
                            <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Cargando unidades...
                            </div>
                        ) : (
                            <div className="flex items-center gap-3 pl-4 border-l border-gray-100">
                                {selectedUnit?.logoUrl && (
                                    <div className="w-8 h-8 rounded-lg overflow-hidden border border-gray-100 bg-white flex-shrink-0 shadow-sm hidden sm:flex items-center justify-center">
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
                                        className="appearance-none pl-3 pr-9 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-700 font-semibold cursor-pointer hover:bg-gray-100 hover:border-gray-300 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/10 min-w-[200px]"
                                    >
                                        {units.map(unit => (
                                            <option key={unit.id} value={unit.id}>{unit.name}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none group-hover:text-gray-600 transition-colors" />
                                </div>
                            </div>
                        )}
                        <div className="w-9 h-9 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-semibold text-sm">
                            LC
                        </div>
                    </div>
                </header>

                {/* Page Content */}
                <div className="flex-1 overflow-auto p-6">
                    <Outlet />
                </div>
            </main>
        </div>
    )
}
