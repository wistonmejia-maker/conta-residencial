import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UnitProvider } from './lib/UnitContext'
import { AIHistoryProvider } from './lib/AIContext'

import { ToastProvider } from './components/ui/Toast'
import AppLayout from './components/AppLayout'
import DashboardPage from './pages/DashboardPage'
import ProvidersPage from './pages/ProvidersPage'
import ProviderDetailPage from './pages/ProviderDetailPage'
import InvoicesPage from './pages/InvoicesPage'
import PaymentsPage from './pages/PaymentsPage'
import ConciliationPage from './pages/ConciliationPage'
import ReportsHubPage from './pages/ReportsHubPage'
import MonthlyClosurePage from './pages/MonthlyClosurePage'
import UnitsPage from './pages/UnitsPage'
import RecurrenceConfigPage from './pages/RecurrenceConfigPage'
import BudgetPage from './pages/BudgetPage'
import { AIChatWidget } from './components/AIChatWidget'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1
    }
  }
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <UnitProvider>
        <AIHistoryProvider>
          <BrowserRouter>
            <ToastProvider />
            <AIChatWidget />

            <Routes>
              <Route path="/" element={<AppLayout />}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="providers" element={<ProvidersPage />} />
                <Route path="providers/:id" element={<ProviderDetailPage />} />
                <Route path="invoices" element={<InvoicesPage />} />
                <Route path="payments" element={<PaymentsPage />} />
                <Route path="conciliation" element={<ConciliationPage />} />
                <Route path="closure" element={<MonthlyClosurePage />} />
                <Route path="reports" element={<ReportsHubPage />} />
                <Route path="units" element={<UnitsPage />} />
                <Route path="recurrence" element={<RecurrenceConfigPage />} />
                <Route path="budget" element={<BudgetPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AIHistoryProvider>
      </UnitProvider>
    </QueryClientProvider>

  )
}

export default App
