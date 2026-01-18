import { API_BASE, handleResponse } from './common'



export function connectGmail(unitId: string) {
    window.open(`${API_BASE}/auth/google?unitId=${unitId}`, 'gmail-auth', 'width=600,height=700');
}


export async function getGmailStatus(unitId: string): Promise<{ connected: boolean; email?: string }> {
    const res = await fetch(`${API_BASE}/auth/status?unitId=${unitId}`);
    return handleResponse<{ connected: boolean; email?: string }>(res, 'Error al obtener estado de Gmail');
}


export async function disconnectGmail(unitId: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/auth/google?unitId=${unitId}`, {
        method: 'DELETE'
    })
    return handleResponse<{ success: boolean; message: string }>(res, 'Error al desconectar Gmail');
}


export async function getGmailPreview(unitId: string): Promise<{ success: boolean; emails: any[] }> {
    const res = await fetch(`${API_BASE}/invoices/gmail/preview?unitId=${unitId}`);
    return handleResponse<{ success: boolean; emails: any[] }>(res, 'Error al obtener vista previa de Gmail');
}


export async function scanGmail(unitId: string): Promise<{
    success: boolean;
    jobId: string;
}> {
    const res = await fetch(`${API_BASE}/invoices/scan-gmail?unitId=${unitId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    });
    return handleResponse(res, 'Error al escanear Gmail');
}

export async function getScanStatus(jobId: string): Promise<{
    id: string;
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    progress: number;
    totalItems: number;
    processedCount: number;
    results: any[];
    error?: string;
}> {
    const res = await fetch(`${API_BASE}/invoices/scan-status/${jobId}`);
    return handleResponse(res, 'Error al obtener estado de escaneo');
}


export async function analyzeDocument(file: File): Promise<{
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
}> {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`${API_BASE}/invoices/analyze`, {
        method: 'POST',
        body: formData
    });
    return handleResponse(res, 'Error al analizar documento');
}

