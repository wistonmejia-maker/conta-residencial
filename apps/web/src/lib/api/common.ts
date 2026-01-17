export const API_BASE = import.meta.env.VITE_API_URL || 'https://conta-residencial-production.up.railway.app/api'

export async function handleResponse<T>(res: Response, errorMsg: string): Promise<T> {
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Error desconocido' }));
        throw new Error(err.error || err.message || errorMsg);
    }
    return res.json();
}
