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
    console.log('Uploading file:', file.name, 'to folder:', folder)

    // Create FormData for multipart upload
    const formData = new FormData()
    formData.append('file', file)
    formData.append('folder', folder)

    const response = await fetch(`${API_BASE}/files/upload`, {
        method: 'POST',
        body: formData
    })

    if (!response.ok) {
        let errorMsg = 'Error uploading file';
        try {
            const error = await response.json();
            errorMsg = error.error || error.message || errorMsg;
        } catch (e) {
            const text = await response.text();
            errorMsg = text || `Error del servidor (${response.status})`;
        }
        throw new Error(errorMsg)
    }

    const result = await response.json()
    console.log('Upload complete:', result)

    return {
        url: result.url,
        fileName: result.filename,
        type: result.mimetype
    }
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

