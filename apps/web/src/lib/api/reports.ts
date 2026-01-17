import { API_BASE } from './common'
import type { Invoice } from './invoices'
import type { Payment } from './payments'
import type { Provider } from './providers'

export interface MonthlyReport {
    id: string
    unitId: string
    month: string
    year: string
    status: string
    createdAt: string
    _count?: { invoices: number; payments: number }
    invoices?: (Invoice & { provider?: Provider })[]
    payments?: (Payment & {
        invoiceItems?: { invoice: Invoice & { provider?: Provider } }[]
    })[]
    pdfUrl?: string
}

export interface MissingInvoiceAlert {
    providerId: string
    providerName: string
    providerNit: string
    category: string | null
    month: number
    year: number
}

export async function getReports(unitId: string) {
    const res = await fetch(`${API_BASE}/reports?unitId=${unitId}`)
    return res.json() as Promise<MonthlyReport[]>
}

export async function createReport(data: any) {
    const res = await fetch(`${API_BASE}/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    return res.json()
}

export async function deleteReport(id: string) {
    const res = await fetch(`${API_BASE}/reports/${id}`, { method: 'DELETE' })
    return res.json()
}

export async function getMissingRecurringInvoices(unitId: string, month?: number, year?: number) {
    const params = new URLSearchParams({ unitId })
    if (month) params.set('month', month.toString())
    if (year) params.set('year', year.toString())
    const res = await fetch(`${API_BASE}/alerts/missing-invoices?${params}`)
    return res.json()
}

export async function getAuditPreview(unitId: string, month: number, year: number) {
    const params = new URLSearchParams({ unitId, month: month.toString(), year: year.toString() })
    const res = await fetch(`${API_BASE}/reports/audit-preview?${params}`)
    return res.json()
}

export async function analyzeReport(reportTitle: string, data: any[]) {
    const res = await fetch(`${API_BASE}/ai/analyze-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportTitle, data })
    })
    return res.json()
}
