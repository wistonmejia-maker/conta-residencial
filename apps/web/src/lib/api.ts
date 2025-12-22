const API_BASE = '/api'

// ============ UNITS ============
export async function getUnits() {
    const res = await fetch(`${API_BASE}/units`)
    return res.json()
}

export async function getUnit(id: string) {
    const res = await fetch(`${API_BASE}/units/${id}`)
    return res.json()
}

export async function createUnit(data: { name: string; taxId: string; address?: string; consecutiveSeed?: number }) {
    const res = await fetch(`${API_BASE}/units`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    return res.json()
}

export async function updateUnit(id: string, data: Partial<{ name: string; taxId: string; address: string; consecutiveSeed: number }>) {
    const res = await fetch(`${API_BASE}/units/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    return res.json()
}

// ============ PROVIDERS (GLOBAL) ============
export interface Provider {
    id: string
    name: string
    taxType: string
    nit: string
    dv: string
    email?: string
    phone?: string
    address?: string
    city?: string
    bankAccount?: string
    bankName?: string
    accountType?: string
    defaultRetefuentePerc: number
    defaultReteicaPerc: number
    isRecurring?: boolean
    recurringCategory?: string
    category?: string
    status: string
    createdAt?: string
    updatedAt?: string
    documents?: ProviderDocument[]
    _count?: { invoices: number; documents: number }
}

export interface ProviderDocument {
    id: string
    providerId: string
    type: 'rut' | 'pila' | 'cert_bancaria' | 'contrato' | 'otro'
    fileName: string
    fileUrl: string
    fileSize?: number
    expiresAt?: string
    isExpired?: boolean
    uploadedAt: string
    notes?: string
}

// Document type labels in Spanish
export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
    rut: 'RUT',
    pila: 'Planilla PILA (EPS/Pensión/ARL)',
    cert_bancaria: 'Certificación Bancaria',
    contrato: 'Contrato',
    otro: 'Otro'
}

export async function getProviders(params?: { status?: string; search?: string; category?: string }) {
    const searchParams = new URLSearchParams()
    if (params?.status) searchParams.set('status', params.status)
    if (params?.search) searchParams.set('search', params.search)
    if (params?.category) searchParams.set('category', params.category)
    const url = `${API_BASE}/providers${searchParams.toString() ? '?' + searchParams : ''}`
    const res = await fetch(url)
    return res.json()
}

export async function getProvider(id: string) {
    const res = await fetch(`${API_BASE}/providers/${id}`)
    return res.json()
}

export async function createProvider(data: Partial<Provider>) {
    const res = await fetch(`${API_BASE}/providers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    return res.json()
}

export async function updateProvider(id: string, data: Partial<Provider>) {
    const res = await fetch(`${API_BASE}/providers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    return res.json()
}

export async function deleteProvider(id: string) {
    const res = await fetch(`${API_BASE}/providers/${id}`, { method: 'DELETE' })
    return res.json()
}

export async function validateNit(nit: string) {
    const res = await fetch(`${API_BASE}/providers/validate-nit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nit })
    })
    return res.json() as Promise<{ nit: string; dv: string; formatted: string; exists: boolean; existingProvider?: { id: string; name: string } }>
}

// Bulk import providers
export async function bulkImportProviders(providers: Partial<Provider>[]) {
    const res = await fetch(`${API_BASE}/providers/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providers })
    })
    return res.json() as Promise<{
        total: number
        created: number
        failed: number
        results: { success: any[]; errors: any[] }
    }>
}

// Provider documents
export async function getProviderDocuments(providerId: string) {
    const res = await fetch(`${API_BASE}/providers/${providerId}/documents`)
    return res.json() as Promise<{ documents: ProviderDocument[] }>
}

export async function addProviderDocument(providerId: string, data: {
    type: string
    fileName: string
    fileUrl: string
    fileSize?: number
    expiresAt?: string
    notes?: string
}) {
    const res = await fetch(`${API_BASE}/providers/${providerId}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    return res.json()
}

export async function deleteProviderDocument(providerId: string, docId: string) {
    const res = await fetch(`${API_BASE}/providers/${providerId}/documents/${docId}`, { method: 'DELETE' })
    return res.json()
}

// ============ INVOICES ============
export interface Invoice {
    id: string
    unitId: string
    providerId: string
    invoiceNumber: string
    isAutogenerated?: boolean
    invoiceDate: string
    dueDate?: string
    subtotal: number
    taxIva: number
    totalAmount: number
    description?: string
    pdfUrl?: string
    fileUrl?: string
    status: string
    paidAmount?: number
    balance?: number
    monthlyReportId?: string
}

export async function getInvoices(filters?: { unitId?: string; providerId?: string; status?: string }) {
    const params = new URLSearchParams()
    if (filters?.unitId) params.set('unitId', filters.unitId)
    if (filters?.providerId) params.set('providerId', filters.providerId)
    if (filters?.status) params.set('status', filters.status)
    const res = await fetch(`${API_BASE}/invoices?${params}`)
    return res.json()
}

export async function getInvoice(id: string) {
    const res = await fetch(`${API_BASE}/invoices/${id}`)
    return res.json()
}

export async function createInvoice(data: Partial<Invoice>) {
    const res = await fetch(`${API_BASE}/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    return res.json()
}

export async function updateInvoice(id: string, data: Partial<Invoice>) {
    const res = await fetch(`${API_BASE}/invoices/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    return res.json()
}

export async function deleteInvoice(id: string) {
    const res = await fetch(`${API_BASE}/invoices/${id}`, { method: 'DELETE' })
    return res.json()
}

export async function getInvoiceStats(unitId?: string) {
    const url = unitId ? `${API_BASE}/invoices/stats/summary?unitId=${unitId}` : `${API_BASE}/invoices/stats/summary`
    const res = await fetch(url)
    return res.json()
}

export async function getNextCCNumber(unitId: string): Promise<{ number: string; prefix: string; nextNumber: number }> {
    const res = await fetch(`${API_BASE}/invoices/next-cc-number?unitId=${unitId}`)
    return res.json()
}

// ============ PAYMENTS ============
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
}

export async function getPayments(filters?: { unitId?: string; status?: string; month?: number; year?: number }) {
    const params = new URLSearchParams()
    if (filters?.unitId) params.set('unitId', filters.unitId)
    if (filters?.status) params.set('status', filters.status)
    if (filters?.month) params.set('month', filters.month.toString())
    if (filters?.year) params.set('year', filters.year.toString())
    const res = await fetch(`${API_BASE}/payments?${params}`)
    return res.json()
}

export async function getPayment(id: string) {
    const res = await fetch(`${API_BASE}/payments/${id}`)
    return res.json()
}

export async function createPayment(data: {
    unitId: string
    paymentDate: string
    sourceType: string
    amountPaid: number
    retefuenteApplied?: number
    reteicaApplied?: number
    bankPaymentMethod?: string
    transactionRef?: string
    supportFileUrl?: string
    pilaFileUrl?: string
    invoiceAllocations?: { invoiceId: string; amount: number }[]
    hasAuditIssue?: boolean
    hasPendingInvoice?: boolean
}) {
    const res = await fetch(`${API_BASE}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    return res.json()
}

export async function updatePayment(id: string, data: Partial<Payment>) {
    const res = await fetch(`${API_BASE}/payments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    return res.json()
}

export async function deletePayment(id: string) {
    const res = await fetch(`${API_BASE}/payments/${id}`, { method: 'DELETE' })
    return res.json()
}

export async function linkInvoiceToPayment(paymentId: string, invoiceId: string, amount: number) {
    const res = await fetch(`${API_BASE}/payments/${paymentId}/link-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId, amount })
    })
    return res.json()
}

// ============ BANK MOVEMENTS ============
export interface BankMovement {
    id: string
    unitId: string
    transactionDate: string
    description?: string
    amount: number
    referenceCode?: string
    isConciliated: boolean
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

// ============ CONCILIATION ============
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

// ============ ALERTS ============
export interface MissingInvoiceAlert {
    providerId: string
    providerName: string
    providerNit: string
    category: string | null
    month: number
    year: number
}

export async function getMissingRecurringInvoices(unitId: string, month?: number, year?: number) {
    const params = new URLSearchParams({ unitId })
    if (month) params.set('month', month.toString())
    if (year) params.set('year', year.toString())
    const res = await fetch(`${API_BASE}/alerts/missing-invoices?${params}`)
    return res.json() as Promise<{
        month: number
        year: number
        totalRecurring: number
        missing: number
        providers: MissingInvoiceAlert[]
    }>
}

// ============ PROVIDER UNIT CONFIGS ============
export async function getProviderUnitConfig(providerId: string, unitId: string) {
    const res = await fetch(`${API_BASE}/provider-configs/${unitId}/${providerId}`)
    return res.json()
}

export async function updateProviderUnitConfig(providerId: string, unitId: string, data: any) {
    const res = await fetch(`${API_BASE}/provider-configs/${unitId}/${providerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    return res.json()
}

// ============ MONTHLY REPORTS ============
export interface MonthlyReport {
    id: string
    unitId: string
    month: string
    year: string
    status: string
    createdAt: string
    _count?: { invoices: number; payments: number }
    // Expanded for details
    invoices?: (Invoice & { provider?: Provider })[]
    payments?: (Payment & {
        invoiceItems?: { invoice: Invoice & { provider?: Provider } }[]
    })[]
    pdfUrl?: string
}

export async function getReports(unitId: string) {
    const res = await fetch(`${API_BASE}/reports?unitId=${unitId}`)
    return res.json() as Promise<MonthlyReport[]>
}

export async function createReport(data: {
    unitId: string
    month: string
    year: string
    paymentIds: string[]
    invoiceIds: string[]
    pdfUrl?: string
}) {
    const res = await fetch(`${API_BASE}/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    return res.json()
}

export async function deleteReport(id: string) {
    const res = await fetch(`${API_BASE}/reports/${id}`, {
        method: 'DELETE'
    })
    return res.json()
}

// ============ FILES ============
export async function uploadFile(file: File, folder: string = 'general') {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('folder', folder)

    const res = await fetch(`${API_BASE}/files/upload`, {
        method: 'POST',
        body: formData
    })

    if (!res.ok) {
        throw new Error('Error al subir archivo')
    }

    const data = await res.json()
    return data.url as string
}
