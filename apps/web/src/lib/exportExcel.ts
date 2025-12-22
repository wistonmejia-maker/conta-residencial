import * as XLSX from 'xlsx'

interface ExportColumn {
    key: string
    header: string
    format?: 'money' | 'date' | 'text'
}

/**
 * Export data to Excel file
 * @param data Array of objects to export
 * @param columns Column definitions with key, header, and optional format
 * @param filename Filename without extension
 */
export function exportToExcel<T extends Record<string, any>>(
    data: T[],
    columns: ExportColumn[],
    filename: string
) {
    // Transform data based on column config
    const rows = data.map(row => {
        const formattedRow: Record<string, any> = {}
        columns.forEach(col => {
            let value = row[col.key]

            if (col.format === 'money' && typeof value === 'number') {
                formattedRow[col.header] = value
            } else if (col.format === 'date' && value) {
                formattedRow[col.header] = new Date(value).toLocaleDateString('es-CO')
            } else {
                formattedRow[col.header] = value ?? ''
            }
        })
        return formattedRow
    })

    // Create workbook and worksheet
    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Datos')

    // Auto-size columns
    const colWidths = columns.map(col => ({
        wch: Math.max(col.header.length, 15)
    }))
    worksheet['!cols'] = colWidths

    // Generate and download
    XLSX.writeFile(workbook, `${filename}.xlsx`)
}

/**
 * Format money for display
 */
export function formatMoneyForExport(value: number): string {
    return new Intl.NumberFormat('es-CO', {
        style: 'decimal',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(value)
}
