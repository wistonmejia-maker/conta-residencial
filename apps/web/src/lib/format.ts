/**
 * Centralized Currency Formatting Utilities
 * 
 * Standard format for Colombian Pesos (COP):
 * - Display: $ 157.005 (with currency symbol)
 * - Input: 157.005 (thousands separator, no symbol)
 * - Storage: 157005 (raw number)
 */

/**
 * Format a number as Colombian Peso currency for display
 * Example: 157005 → "$ 157.005"
 */
export const formatMoney = (value: number | string | null | undefined): string => {
    const numValue = typeof value === 'string' ? parseFloat(value) : (value ?? 0);
    if (isNaN(numValue)) return '$ 0';

    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(numValue);
};

/**
 * Format a number with thousands separator (no currency symbol)
 * For use in input fields display
 * Example: 157005 → "157.005"
 */
export const formatInputMoney = (value: number | string | null | undefined): string => {
    const numValue = typeof value === 'string' ? parseFloat(value) : (value ?? 0);
    if (isNaN(numValue) || numValue === 0) return '';

    return new Intl.NumberFormat('es-CO', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(numValue);
};

/**
 * Parse a formatted money string back to a number
 * Handles Colombian format (dots as thousands separator)
 * Example: "157.005" → 157005
 */
export const parseInputMoney = (value: string): number => {
    if (!value || value.trim() === '') return 0;

    // Remove currency symbol, spaces, and handle Colombian format
    // In Colombian format: dots are thousands separators, comma is decimal
    const cleaned = value
        .replace(/\$/g, '')          // Remove $ symbol
        .replace(/\s/g, '')          // Remove spaces
        .replace(/\./g, '')          // Remove dots (thousands separator)
        .replace(/,/g, '.');         // Replace comma with dot for decimal

    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
};

/**
 * Format money for export (Excel, CSV) - no symbol, just number with separators
 */
export const formatMoneyForExport = (value: number): string => {
    return formatInputMoney(value);
};
