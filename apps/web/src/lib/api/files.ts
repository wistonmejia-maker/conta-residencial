import { API_BASE, handleResponse } from './common'

export async function uploadFile(file: File, folder: string = 'general') {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('folder', folder)

    const res = await fetch(`${API_BASE}/files/upload`, {
        method: 'POST',
        body: formData
    })

    return handleResponse<{ url: string }>(res, 'Error al subir archivo').then(data => data.url)
}
