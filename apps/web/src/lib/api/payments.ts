import { API_BASE, handleResponse } from './common'


export interface Payment {
    id: string
    unitId: string
    consecutiveNumber?: number
    manualConsecutive?: string
    paymentDate: string
    sourceType: 'INTERNAL' | 'EXTERNAL'
    amountPaid: number
    retefuenteApplied: number
    reteicaApplied: number
    netValue: number
    bankPaymentMethod?: string
    transactionRef?: string
    pilaFileUrl?: string
    status: string
    monthlyReportId?: string
    hasAuditIssue?: boolean
    hasPendingInvoice?: boolean
    supportFileUrl?: string
    // Dynamic Receipt Fields
    observations?: string
    referenceNumber?: string
    bankName?: string
    accountType?: string
    elaboratedBy?: string
    reviewedBy?: string
    approvedBy?: string
    // Relations (populated by includes from API)
    invoiceItems?: Array<{
        id: string
        amountApplied: number
        invoice: {
            id: string
            invoiceNumber: string
            invoiceDate: string
            description?: string
        }
    }>
    provider?: {
        name: string
    }
}


export interface BankMovement {
    id: string
    unitId: string
    transactionDate: string
    description?: string
    amount: number
    referenceCode?: string
    isConciliated: boolean
}

export async function getPayments(filters?: { unitId?: string; status?: string; month?: number; year?: number }): Promise<{ payments: Payment[] }> {
    const params = new URLSearchParams()
    if (filters?.unitId) params.set('unitId', filters.unitId)
    if (filters?.status) params.set('status', filters.status)
    if (filters?.month) params.set('month', filters.month.toString())
    if (filters?.year) params.set('year', filters.year.toString())
    const res = await fetch(`${API_BASE}/payments?${params}`)
    return handleResponse<{ payments: Payment[] }>(res, 'Error al obtener pagos')
}


export async function getPayment(id: string): Promise<Payment> {
    const res = await fetch(`${API_BASE}/payments/${id}`)
    return handleResponse<Payment>(res, 'Error al obtener pago')
}


export async function createPayment(data: any): Promise<Payment> {
    const res = await fetch(`${API_BASE}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    return handleResponse<Payment>(res, 'Error al crear pago')
}


export async function updatePayment(id: string, data: Partial<Payment>): Promise<Payment> {
    const res = await fetch(`${API_BASE}/payments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    return handleResponse<Payment>(res, 'Error al actualizar pago')
}


export async function deletePayment(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/payments/${id}`, { method: 'DELETE' })
    return handleResponse<{ success: boolean }>(res, 'Error al eliminar pago')
}


export async function linkInvoiceToPayment(paymentId: string, invoiceId: string, amount: number) {
    const res = await fetch(`${API_BASE}/payments/${paymentId}/link-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId, amount })
    })
    return res.json()
}

export async function getBankMovements(filters?: { unitId?: string; isConciliated?: boolean; month?: number; year?: number }) {
    const params = new URLSearchParams()
    if (filters?.unitId) params.set('unitId', filters.unitId)
    if (filters?.isConciliated !== undefined) params.set('isConciliated', filters.isConciliated.toString())
    if (filters?.month) params.set('month', filters.month.toString())
    if (filters?.year) params.set('year', filters.year.toString())
    const res = await fetch(`${API_BASE}/bank?${params}`)
    return res.json()
}

export async function createBankMovement(data: Partial<BankMovement>) {
    const res = await fetch(`${API_BASE}/bank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    return res.json()
}

export async function importBankMovements(unitId: string, movements: unknown[]) {
    const res = await fetch(`${API_BASE}/bank/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitId, movements })
    })
    return res.json()
}

export async function deleteBankMovement(id: string) {
    const res = await fetch(`${API_BASE}/bank/${id}`, { method: 'DELETE' })
    return res.json()
}

export async function conciliate(paymentId: string, bankMovementId: string, notes?: string) {
    const res = await fetch(`${API_BASE}/bank/conciliate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId, bankMovementId, notes })
    })
    return res.json()
}

export async function unconciliate(conciliationId: string) {
    const res = await fetch(`${API_BASE}/bank/conciliate/${conciliationId}`, { method: 'DELETE' })
    return res.json()
}

export async function autoConciliate(unitId: string) {
    const res = await fetch(`${API_BASE}/bank/auto-conciliate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitId })
    })
    return res.json()
}

export async function getConciliationSummary(unitId?: string, month?: number, year?: number) {
    const params = new URLSearchParams()
    if (unitId) params.set('unitId', unitId)
    if (month) params.set('month', month.toString())
    if (year) params.set('year', year.toString())
    const res = await fetch(`${API_BASE}/bank/summary?${params}`)
    return res.json()
}

export async function aiExtractBankMovements(file: File) {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`${API_BASE}/bank/ai-extract`, {
        method: 'POST',
        body: formData
    })
    return res.json()
}

export async function aiConciliate(unitId: string) {
    const res = await fetch(`${API_BASE}/bank/ai-conciliate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitId })
    })
    return res.json()
}
