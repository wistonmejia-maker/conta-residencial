import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
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

interface DashboardChartsProps {
  payments: Payment[]
}

const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4']

export function DashboardCharts({ payments }: DashboardChartsProps) {
  // 1. Process data for Monthly Bar Chart (Last 6 months)
  const monthlyData = useMemo(() => {
    const months: Record<string, number> = {}
    const now = new Date()
    
    // Initialize last 6 months with 0
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const label = d.toLocaleString('es-CO', { month: 'short' })
      months[label] = 0
    }

    payments.forEach(p => {
      const date = new Date(p.paymentDate)
      const label = date.toLocaleString('es-CO', { month: 'short' })
      if (months[label] !== undefined) {
        months[label] += Number(p.netValue)
      }
    })

    return Object.entries(months).map(([name, total]) => ({ name, total }))
  }, [payments])

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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Monthly Trend */}
      <div className="card p-5">
        <h3 className="font-semibold text-gray-900 mb-6">Tendencia de Egresos (6 meses)</h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#9ca3af', fontSize: 12 }} 
                dy={10}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#9ca3af', fontSize: 10 }}
                tickFormatter={(val) => `$${val / 1000000}M`}
                width={40}
              />
              <Tooltip 
                formatter={(value: any) => [formatMoney(Number(value)), 'Egresos']}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Bar 
                dataKey="total" 
                fill="#4f46e5" 
                radius={[4, 4, 0, 0]} 
                barSize={32}
                animationDuration={1500}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Category Distribution */}
      <div className="card p-5 text-zinc-300">
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
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Legend 
                verticalAlign="bottom" 
                height={36} 
                iconType="circle"
                wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
