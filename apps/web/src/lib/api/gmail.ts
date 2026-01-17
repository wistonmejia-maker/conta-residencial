import { API_BASE } from './common'
import type { Invoice } from './invoices'

export function connectGmail(unitId: string) {
    window.location.href = `${API_BASE}/auth/google?unitId=${unitId}`;
}

export async function getGmailStatus(unitId: string) {
    const res = await fetch(`${API_BASE}/auth/status?unitId=${unitId}`);
    return res.json() as Promise<{ connected: boolean; email?: string }>;
}

export async function disconnectGmail(unitId: string) {
    const res = await fetch(`${API_BASE}/auth/google?unitId=${unitId}`, {
        method: 'DELETE'
    })
    return res.json()
}

export async function getGmailPreview(unitId: string) {
    const res = await fetch(`${API_BASE}/invoices/gmail/preview?unitId=${unitId}`);
    return res.json() as Promise<{ success: boolean; emails: any[] }>;
}

export async function scanGmail(unitId: string) {
    const res = await fetch(`${API_BASE}/invoices/scan-gmail?unitId=${unitId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    });
    return res.json() as Promise<{
        success: boolean;
        processedCount: number;
        results: { status: string; file: string; invoice?: Invoice }[];
    }>;
}

export async function analyzeDocument(file: File) {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`${API_BASE}/invoices/analyze`, {
        method: 'POST',
        body: formData
    });
    return res.json() as Promise<{
        type: 'INVOICE' | 'PAYMENT_RECEIPT' | 'OTHER';
        confidence?: number;
        data?: {
            totalAmount: number;
            date: string;
            concept: string;

            nit?: string;
            providerName?: string;
            clientNit?: string | null;
            invoiceNumber?: string;
            transactionRef?: string;
            bankName?: string;
        }
    }>;
}
