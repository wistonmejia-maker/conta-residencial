
import os
import re

path = r'c:\Users\ATC\Documents\Proyectos ATC\conta-residencial\apps\web\src\pages\MonthlyClosurePage.tsx'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Pattern to find the Conciliación column end and the start of next column
# This matches: </td> [whitespace] <td className="px-4 py-3 text-center"> [whitespace] {payment.supportFileUrl ? (
pattern = r'(</td>\s*<td className="px-4 py-3 text-center">\s*\{payment\.supportFileUrl \? \()'

new_column = """</td>
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
                                                 <td className="px-4 py-3 text-center">
                                                     {payment.supportFileUrl ? ("""

if 'pilaFileUrl' not in content or content.count('pilaFileUrl') < 3: # 2 in header/handler, 3+ with body
    new_content = re.sub(pattern, new_column, content, count=1)
    if new_content != content:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print("Body modified successfully")
    else:
        print("Pattern not found")
else:
    print("Already modified")
