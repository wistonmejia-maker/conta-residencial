import { useMemo } from 'react'
import {
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  ComposedChart,
  Line,
  Area
} from 'recharts'
import { formatMoney } from '../../lib/format'

interface Payment {
  id: string
  paymentDate: string | Date
  netValue: number | string
  status: string
  provider?: {
    name: string
    category?: string | null
  }
}

interface Invoice {
  id: string
  invoiceDate: string | Date
  totalAmount: number | string
}

interface DashboardChartsProps {
  payments: Payment[]
  invoices: Invoice[]
}

const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4']

export function DashboardCharts({ payments, invoices }: DashboardChartsProps) {
  // 1. Process data for Comparative Monthly Chart (Last 6 months)
  const monthlyData = useMemo(() => {
    const months: Record<string, { paid: number; invoiced: number }> = {}
    const now = new Date()
    
    // Initialize last 6 months
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const label = d.toLocaleString('es-CO', { month: 'short' })
      months[label] = { paid: 0, invoiced: 0 }
    }

    // Sum Payments (by paymentDate)
    payments.forEach(p => {
      const date = new Date(p.paymentDate)
      const label = date.toLocaleString('es-CO', { month: 'short' })
      if (months[label]) {
        months[label].paid += Number(p.netValue)
      }
    })

    // Sum Invoices (by invoiceDate)
    invoices.forEach(inv => {
      const date = new Date(inv.invoiceDate)
      const label = date.toLocaleString('es-CO', { month: 'short' })
      if (months[label]) {
        months[label].invoiced += Number(inv.totalAmount)
      }
    })

    return Object.entries(months).map(([name, data]) => ({ 
      name, 
      paid: data.paid, 
      invoiced: data.invoiced,
      balance: data.paid - data.invoiced 
    }))
  }, [payments, invoices])

  // 2. Process data for Category Pie Chart (Top Categories)
  const categoryData = useMemo(() => {
    const categories: Record<string, number> = {}
    
    payments.forEach(p => {
      const cat = p.provider?.category || 'Otros'
      categories[cat] = (categories[cat] || 0) + Number(p.netValue)
    })

    const data = Object.entries(categories)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5) // Top 5 categories

    return data
  }, [payments])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-6">
      {/* Comparative Flow Chart */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-semibold text-gray-900">Balance de Flujo (6 meses)</h3>
          <div className="flex gap-4 text-xs font-medium">
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-indigo-600"></div> Pagado</div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-400"></div> Facturado</div>
          </div>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={monthlyData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#9ca3af', fontSize: 11 }} 
                dy={10}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#9ca3af', fontSize: 10 }}
                tickFormatter={(val) => `$${val / 1000}k`}
                width={40}
              />
              <Tooltip 
                formatter={(value: any, name: any) => {
                  const label = name === 'paid' ? 'Egresos Pagados' : (name === 'invoiced' ? 'Total Facturado' : 'Balance Neto')
                  return [formatMoney(Number(value)), label]
                }}
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
              />
              <Bar 
                dataKey="paid" 
                fill="#4f46e5" 
                radius={[4, 4, 0, 0]} 
                barSize={20}
                animationDuration={1500}
              />
              <Bar 
                dataKey="invoiced" 
                fill="#fbbf24" 
                radius={[4, 4, 0, 0]} 
                barSize={20}
                animationDuration={1500}
              />
              <Line 
                type="monotone" 
                dataKey="balance" 
                stroke="#10b981" 
                strokeWidth={2} 
                dot={{ fill: '#10b981', r: 3 }}
                animationDuration={2000}
              />
              <Area 
                type="monotone" 
                dataKey="balance" 
                fill="#10b981" 
                stroke="none" 
                fillOpacity={0.05} 
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[10px] text-center text-gray-400 mt-4 italic">
          * Línea verde positiva indica que se pagó más de lo facturado en el mes (pago de saldos anteriores).
        </p>
      </div>

      {/* Category Distribution */}
      <div className="card p-5">
        <h3 className="font-semibold text-gray-900 mb-6 font-geist">Distribución por Categoría</h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={categoryData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
                animationDuration={1500}
              >
                {categoryData.map((_entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} strokeWidth={0} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value: any) => formatMoney(Number(value))}
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
              />
              <Legend 
                verticalAlign="bottom" 
                height={36} 
                iconType="circle"
                wrapperStyle={{ fontSize: '11px', paddingTop: '20px' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
