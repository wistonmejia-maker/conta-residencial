const API_BASE = '/api'

/**
 * Uploads a file to the local server storage.
 * Files are saved in the /apps/api/uploads folder.
 * 
 * @param file The file to upload
 * @param folder The folder path for organizing files (e.g., 'units/unit123/invoices')
 * @returns The URL and metadata of the uploaded file
 */
export async function uploadFileToStorage(file: File, folder: string): Promise<{ url: string, fileName: string, type: string }> {
    console.log('Uploading file:', file.name, 'to folder:', folder, 'Size:', (file.size / 1024 / 1024).toFixed(2), 'MB')

    try {
        // 0. Pre-calculate identity (matching backend files.ts / cloudinary logic)
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
        const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
        const publicId = isPdf 
            ? safeName + '_secure' // Required to bypass .pdf extension block
            : safeName.replace(/\.[^/.]+$/, "")

        // 1. Get Signature from backend (Sign folder AND public_id)
        const sigResponse = await fetch(`${API_BASE}/files/signature?folder=${encodeURIComponent(folder)}&public_id=${encodeURIComponent(publicId)}`)
        if (!sigResponse.ok) throw new Error('Error al obtener firma de seguridad de carga')
        const { signature, timestamp, apiKey, cloudName, folder: secureFolder } = await sigResponse.json()

        // 2. Prepare Cloudinary Upload
        const formData = new FormData()
        formData.append('file', file)
        formData.append('signature', signature)
        formData.append('timestamp', timestamp.toString())
        formData.append('api_key', apiKey)
        formData.append('folder', secureFolder)
        formData.append('public_id', publicId)

        // Use 'auto' to let Cloudinary decide and often allow larger limits than 'raw' (10MB)
        const resType = 'auto'

        // 3. Upload directly to Cloudinary
        const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/${resType}/upload`
        const response = await fetch(uploadUrl, {
            method: 'POST',
            body: formData
        })

        if (!response.ok) {
            const error = await response.json()
            throw new Error(error.error?.message || 'Error en comunicación directa con la nube')
        }

        const result = await response.json()
        console.log('Direct Cloudinary Upload complete:', result)

        return {
            url: result.secure_url,
            fileName: file.name,
            type: file.type
        }

    } catch (directError: any) {
        console.warn('Direct upload failed or not configured, falling back to server upload...', directError)
        
        // Fallback to legacy server upload if Cloudinary is not configured or direct fails
        const formData = new FormData()
        formData.append('file', file)
        formData.append('folder', folder)

        const response = await fetch(`${API_BASE}/files/upload`, {
            method: 'POST',
            body: formData
        })

        if (!response.ok) {
            throw new Error('Fallback upload also failed.')
        }

        const result = await response.json()
        return {
            url: result.url,
            fileName: result.filename,
            type: result.mimetype
        }
    }
}

/**
 * Uploads a file with progress tracking using XMLHttpRequest.
 * 
 * @param file The file to upload
 * @param folder The folder path
 * @param onProgress Callback function for upload progress (0-100)
 * @returns The URL and metadata
 */
export async function uploadFileToStorageWithProgress(
    file: File,
    folder: string,
    onProgress?: (percent: number) => void
): Promise<{ url: string, fileName: string, type: string }> {
    return new Promise((resolve, reject) => {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('folder', folder)

        const xhr = new XMLHttpRequest()
        xhr.open('POST', `${API_BASE}/files/upload`)

        // Track upload progress
        if (xhr.upload && onProgress) {
            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percent = Math.round((event.loaded / event.total) * 100)
                    onProgress(percent)
                }
            }
        }

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const result = JSON.parse(xhr.response)
                    resolve({
                        url: result.url,
                        fileName: result.filename,
                        type: result.mimetype
                    })
                } catch (e) {
                    reject(new Error('Invalid JSON response from server'))
                }
            } else {
                try {
                    const error = JSON.parse(xhr.response)
                    reject(new Error(error.error || error.message || `Upload failed with status ${xhr.status}`))
                } catch (e) {
                    reject(new Error(`Upload failed with status ${xhr.status}`))
                }
            }
        }

        xhr.onerror = () => {
            reject(new Error('Network error during file upload'))
        }

        xhr.send(formData)
    })
}

/**
 * Deletes a file from the local server storage.
 * 
 * @param folder The folder where the file is stored
 * @param filename The filename to delete
 */
export async function deleteFileFromStorage(folder: string, filename: string): Promise<void> {
    const response = await fetch(`${API_BASE}/files/${folder}/${filename}`, {
        method: 'DELETE'
    })

    if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Error deleting file')
    }
}
