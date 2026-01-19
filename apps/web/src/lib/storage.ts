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
            const text = await response.text();
            try {
                const error = JSON.parse(text);
                errorMsg = error.error || error.message || errorMsg;
            } catch (e) {
                errorMsg = text || `Error del servidor (${response.status})`;
            }
        } catch (readError) {
            errorMsg = `Error connecting to server (${response.status}): ${response.statusText}`;
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
