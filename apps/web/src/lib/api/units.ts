import { API_BASE, handleResponse } from './common'

export interface Unit {
    id: string
    name: string
    taxId: string
    address?: string
    consecutiveSeed: number
}

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
    return handleResponse(res, 'Error al crear la unidad')
}

export async function updateUnit(id: string, data: Partial<{ name: string; taxId: string; address: string; consecutiveSeed: number }>) {
    const res = await fetch(`${API_BASE}/units/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    return handleResponse(res, 'Error al actualizar la unidad')
}

export async function deleteUnit(id: string) {
    const res = await fetch(`${API_BASE}/units/${id}`, { method: 'DELETE' })
    return handleResponse(res, 'Error al eliminar la unidad')
}
