import { useState, useRef } from 'react'
import { Upload, X, FileText, CheckCircle2, AlertTriangle, Image as ImageIcon } from 'lucide-react'
import imageCompression from 'browser-image-compression'
import { uploadFileToStorageWithProgress } from '../../lib/storage'

interface SmartFileUploaderProps {
    folder: string
    onUploadComplete: (url: string, file: File) => void
    currentFileUrl?: string | null
    accept?: string
    label?: string
    maxSizeMB?: number
    className?: string
    onRemove?: () => void
    disabled?: boolean
}

export function SmartFileUploader({
    folder,
    onUploadComplete,
    currentFileUrl,
    accept = "application/pdf,image/*",
    label = "Soporte (PDF/Imagen)",
    maxSizeMB = 10, // Default 10MB limit for server, but we compress images to <1MB
    className = "",
    onRemove,
    disabled = false
}: SmartFileUploaderProps) {
    const [uploading, setUploading] = useState(false)
    const [progress, setProgress] = useState(0)
    const [compressing, setCompressing] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [fileName, setFileName] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        // Reset state
        setError(null)
        setProgress(0)
        setFileName(file.name)

        // Validation
        if (file.size > maxSizeMB * 1024 * 1024 && !file.type.startsWith('image/')) {
            setError(`El archivo excede el límite de ${maxSizeMB}MB`)
            return
        }

        try {
            let fileToUpload = file;

            // 1. Client-side Image Compression
            if (file.type.startsWith('image/')) {
                setCompressing(true)
                try {
                    const options = {
                        maxSizeMB: 1, // Target 1MB
                        maxWidthOrHeight: 1920,
                        useWebWorker: true,
                        initialQuality: 0.8
                    }
                    fileToUpload = await imageCompression(file, options)
                    console.log(`Original: ${(file.size / 1024 / 1024).toFixed(2)}MB -> Compressed: ${(fileToUpload.size / 1024 / 1024).toFixed(2)}MB`)
                } catch (err) {
                    console.error('Compression failed, using original file', err)
                } finally {
                    setCompressing(false)
                }
            }

            // 2. Upload with Progress
            setUploading(true)
            const result = await uploadFileToStorageWithProgress(
                fileToUpload,
                folder,
                (percent) => setProgress(percent)
            )

            // 3. Complete
            onUploadComplete(result.url, fileToUpload)

        } catch (err: any) {
            console.error('Upload failed:', err)
            setError(err.message || 'Error al subir el archivo')
            setFileName(null)
            if (fileInputRef.current) fileInputRef.current.value = ''
        } finally {
            setUploading(false)
            setCompressing(false)
        }
    }

    const triggerFileSelect = () => {
        if (!uploading && !compressing && !disabled) {
            fileInputRef.current?.click()
        }
    }

    // Determine current state visualization
    const showPreview = currentFileUrl && !uploading && !compressing && !error;
    const isImage = currentFileUrl?.match(/\.(jpg|jpeg|png|webp|gif)$/i) || currentFileUrl?.includes('/image/upload/');
    const fileNameDisplay = fileName || (currentFileUrl ? decodeURIComponent(currentFileUrl.split('/').pop() || 'Archivo') : '');

    return (
        <div className={`space-y-2 ${className}`}>
            {label && <label className="block text-sm font-medium text-gray-700">{label}</label>}

            <div
                onClick={!showPreview ? triggerFileSelect : undefined}
                className={`
                    relative w-full border-2 border-dashed rounded-xl p-4 transition-all duration-200
                    ${error ? 'border-red-200 bg-red-50' :
                        disabled ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed' :
                            showPreview ? 'border-emerald-200 bg-emerald-50/30' :
                                'border-gray-300 bg-gray-50 hover:bg-indigo-50 hover:border-indigo-300 cursor-pointer group'}
                `}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept={accept}
                    onChange={handleFileSelect}
                    disabled={uploading || compressing || disabled}
                    className="hidden"
                />

                {/* ERROR STATE */}
                {error && (
                    <div className="flex flex-col items-center text-center p-2">
                        <AlertTriangle className="w-8 h-8 text-red-500 mb-2" />
                        <span className="text-sm font-medium text-red-700 mb-2">{error}</span>
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); triggerFileSelect(); }}
                            className="px-3 py-1 bg-white border border-red-200 text-red-600 rounded-lg text-xs font-bold shadow-sm"
                        >
                            Intentar de nuevo
                        </button>
                    </div>
                )}

                {/* LOADING / PROCESSING STATE */}
                {(uploading || compressing) && (
                    <div className="flex flex-col items-center justify-center p-4">
                        <div className="w-12 h-12 relative flex items-center justify-center mb-3">
                            <svg className="w-full h-full transform -rotate-90">
                                <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-gray-200" />
                                <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="4" fill="transparent"
                                    className="text-indigo-600 transition-all duration-300 ease-out"
                                    strokeDasharray={125.6}
                                    strokeDashoffset={125.6 - (125.6 * progress) / 100}
                                />
                            </svg>
                            <span className="absolute text-xs font-bold text-indigo-700">{progress}%</span>
                        </div>
                        <p className="text-sm font-medium text-indigo-700 animate-pulse">
                            {compressing ? 'Optimizando imagen...' : 'Subiendo archivo...'}
                        </p>
                    </div>
                )}

                {/* PREVIEW STATE */}
                {showPreview && (
                    <div className="flex items-center justify-between gap-3 p-1">
                        <div className="flex items-center gap-3 overflow-hidden">
                            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                                {isImage ? <ImageIcon className="w-5 h-5 text-emerald-600" /> : <FileText className="w-5 h-5 text-emerald-600" />}
                            </div>
                            <div className="flex flex-col overflow-hidden">
                                <span className="text-sm font-bold text-gray-900 truncate max-w-[180px]">{fileNameDisplay}</span>
                                <span className="text-xs text-emerald-600 flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" /> Subido
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={async (e) => {
                                    e.stopPropagation()
                                    try {
                                        const url = currentFileUrl!

                                        // Handle Base64 Data URIs
                                        if (url.startsWith('data:')) {
                                            const parts = url.split(',')
                                            if (parts.length < 2) throw new Error('Invalid data URI')
                                            const byteString = atob(parts[1])
                                            const mimeType = parts[0].split(':')[1]?.split(';')[0] || 'application/pdf'
                                            const ab = new ArrayBuffer(byteString.length)
                                            const ia = new Uint8Array(ab)
                                            for (let i = 0; i < byteString.length; i++) {
                                                ia[i] = byteString.charCodeAt(i)
                                            }
                                            const blob = new Blob([ab], { type: mimeType })
                                            window.open(URL.createObjectURL(blob), '_blank')
                                            return
                                        }

                                        // Detect if it's an image
                                        const isImageFile = /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(url) || url.includes('/image/upload/')

                                        // Handle PDFs and RAW uploads that may have download headers
                                        if (!isImageFile && (url.includes('/raw/upload/') || url.endsWith('.pdf_secure') || !url.toLowerCase().endsWith('.pdf'))) {
                                            // Open window first to avoid popup blocker
                                            const newWindow = window.open('', '_blank')
                                            if (newWindow) {
                                                newWindow.document.write(`
                                                    <html>
                                                        <head><title>Cargando documento...</title></head>
                                                        <body style="display:flex;justify-content:center;align-items:center;height:100vh;margin:0;font-family:sans-serif;background:#f3f4f6;">
                                                            <div style="text-align:center;">
                                                                <div style="margin-bottom:10px;">Cargando documento...</div>
                                                                <div style="font-size:12px;color:#6b7280;">Por favor espere</div>
                                                            </div>
                                                        </body>
                                                    </html>
                                                `)
                                                try {
                                                    const response = await fetch(url)
                                                    const blob = await response.blob()
                                                    const pdfBlob = new Blob([blob], { type: 'application/pdf' })
                                                    newWindow.location.href = URL.createObjectURL(pdfBlob)
                                                } catch (fetchError) {
                                                    newWindow.close()
                                                    console.error('Fetch error:', fetchError)
                                                    alert('No se pudo cargar la vista previa. Abriendo archivo...')
                                                    window.open(url, '_blank')
                                                }
                                            } else {
                                                // Fallback if popup blocked
                                                window.open(url, '_blank')
                                            }
                                        } else {
                                            // Standard behavior for normal PDFs and images
                                            window.open(url, '_blank')
                                        }
                                    } catch (err) {
                                        console.error('Error opening file:', err)
                                        alert('Archivo corrupto o no disponible.')
                                    }
                                }}
                                className="p-2 hover:bg-emerald-100 rounded-lg text-emerald-600 transition-colors"
                                title="Ver archivo"
                            >
                                <FileText className="w-4 h-4" />
                            </button>
                            {!disabled && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (onRemove) onRemove();
                                        setFileName(null);
                                        if (fileInputRef.current) fileInputRef.current.value = '';
                                    }}
                                    className="p-2 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 transition-colors"
                                    title="Eliminar archivo"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* DEFAULT IDLE STATE */}
                {!uploading && !compressing && !error && !showPreview && (
                    <div className="flex flex-col items-center text-center py-2">
                        <div className="p-3 bg-indigo-50 rounded-full mb-3 group-hover:bg-indigo-100 group-hover:scale-110 transition-all duration-300">
                            <Upload className="w-6 h-6 text-indigo-500 group-hover:text-indigo-600" />
                        </div>
                        <p className="text-sm font-bold text-gray-700 mb-1">
                            Toca para subir
                        </p>
                        <p className="text-xs text-gray-400">
                            PDF o Foto (Max {maxSizeMB}MB)
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}
