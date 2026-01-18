import { API_BASE, handleResponse } from './common'

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

export async function getProviderDetail(id: string, unitId?: string) {
    const params = unitId ? `?unitId=${unitId}` : ''
    const res = await fetch(`${API_BASE}/providers/${id}${params}`)
    return res.json()
}

export async function createProvider(data: Partial<Provider>) {
    const res = await fetch(`${API_BASE}/providers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    return handleResponse(res, 'Error al crear proveedor')
}

export async function updateProvider(id: string, data: Partial<Provider>) {
    const res = await fetch(`${API_BASE}/providers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    return handleResponse(res, 'Error al actualizar proveedor')
}

export async function deleteProvider(id: string) {
    const res = await fetch(`${API_BASE}/providers/${id}`, { method: 'DELETE' })
    return res.json()
}

export async function getProviderConfigs(unitId: string) {
    const res = await fetch(`${API_BASE}/provider-configs?unitId=${unitId}`)
    return res.json()
}

export async function upsertProviderConfig(data: { providerId: string; unitId: string; isRecurring: boolean; category?: string }) {
    const res = await fetch(`${API_BASE}/provider-configs`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    return res.json()
}

export async function deleteProviderConfig(id: string) {
    const res = await fetch(`${API_BASE}/provider-configs/${id}`, { method: 'DELETE' })
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
