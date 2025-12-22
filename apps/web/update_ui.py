
import os

path = r'c:\Users\ATC\Documents\Proyectos ATC\conta-residencial\apps\web\src\pages\MonthlyClosurePage.tsx'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update PDF flags
content = content.replace('logoUrl: selectedUnit?.logoUrl\n                }\n            })', 'logoUrl: selectedUnit?.logoUrl\n                },\n                includePila: true\n            })')
content = content.replace('logoUrl: selectedUnit?.logoUrl\r\n                }\r\n            })', 'logoUrl: selectedUnit?.logoUrl\r\n                },\r\n                includePila: true\r\n            })')

# 2. Add handlePilaUpload handler
handler_code = """
    const handlePilaUpload = async (paymentId: string, file: File) => {
        setUploadingPilaId(paymentId)
        try {
            const result = await uploadFile(file, `payments/${unitId}`)
            await updatePayment(paymentId, { pilaFileUrl: result.url })
            alert('PILA cargada con éxito')
            // Refresh payments list to show the new file
            location.reload() 
        } catch (error) {
            console.error('Error uploading PILA:', error)
            alert('Error al cargar PILA')
        } finally {
            setUploadingPilaId(null)
        }
    }
"""

if 'const handlePilaUpload' not in content:
    content = content.replace('const handleGenerateFolder = async () => {', handler_code + '\n    const handleGenerateFolder = async () => {')

# 3. Add table body column
body_pattern = '</span>\n                                                     )}\n                                                 </td>\n                                                 <td className="px-4 py-3 text-center">'
body_pattern_crlf = '</span>\r\n                                                     )}\r\n                                                 </td>\r\n                                                 <td className="px-4 py-3 text-center">'

new_column = """
                                                 </td>
                                                 <td className="px-4 py-3 text-center">
                                                     <div className="flex items-center justify-center gap-1">
                                                         {(payment as any).pilaFileUrl && (
                                                             <button
                                                                 onClick={() => openFileUrl((payment as any).pilaFileUrl!)}
                                                                 className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                                                                 title="Ver PILA"
                                                             >
                                                                 <Briefcase className="w-4 h-4" />
                                                             </button>
                                                         )}
                                                         <button
                                                             onClick={() => {
                                                                 const input = document.createElement('input')
                                                                 input.type = 'file'
                                                                 input.accept = '.pdf'
                                                                 input.onchange = (e) => {
                                                                     const file = (e.target as HTMLInputElement).files?.[0]
                                                                     if (file) handlePilaUpload(payment.id, file)
                                                                 }
                                                                 input.click()
                                                             }}
                                                             disabled={uploadingPilaId === payment.id}
                                                             className={`p-1 rounded ${(payment as any).pilaFileUrl ? 'text-gray-400 hover:bg-gray-100' : 'text-indigo-600 hover:bg-indigo-50'}`}
                                                             title="Cargar PILA"
                                                         >
                                                             {uploadingPilaId === payment.id ? (
                                                                 <Loader2 className="w-4 h-4 animate-spin" />
                                                             ) : (
                                                                 <Upload className="w-4 h-4" />
                                                             )}
                                                         </button>
                                                     </div>
                                                 </td>
"""

if 'pilaFileUrl' not in content:
    if body_pattern in content:
        content = content.replace(body_pattern, '</span>\n                                                     )}\n' + new_column + '\n                                                 <td className="px-4 py-3 text-center">', 1)
    elif body_pattern_crlf in content:
        content = content.replace(body_pattern_crlf, '</span>\r\n                                                     )}\r\n' + new_column + '\r\n                                                 <td className="px-4 py-3 text-center">', 1)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Modified successfully")
