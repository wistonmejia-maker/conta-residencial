/**
 * Formats a date or timestamp into a relative human-readable string in Spanish.
 * Example: "Hace 5 minutos", "Hace 2 días", "Nunca"
 */
export function formatRelativeTime(date: Date | string | null | undefined): string {
    if (!date) return 'Nunca';

    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return 'Nunca';

    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - d.getTime()) / 1000);

    if (diffInSeconds < 60) return 'Hace unos segundos';

    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `Hace ${diffInMinutes} minuto${diffInMinutes > 1 ? 's' : ''}`;

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `Hace ${diffInHours} hora${diffInHours > 1 ? 's' : ''}`;

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 30) return `Hace ${diffInDays} día${diffInDays > 1 ? 's' : ''}`;

    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Formats an ISO date string (e.g. 2026-03-24T00:00:00.000Z) or a local string to a short string (DD/MM/YYYY)
 * ignoring the browser's timezone offset that might shift the day backwards.
 */
export function formatShortDate(dateString: string | null | undefined): string {
    if (!dateString) return '-';
    try {
        // If it's an ISO string, extract the date part (YYYY-MM-DD)
        const datePart = typeof dateString === 'string' && dateString.includes('T') ? dateString.split('T')[0] : dateString;
        const parts = typeof datePart === 'string' ? datePart.split('-') : [];
        if (parts.length === 3) {
            // new Date(year, monthIndex, day) creates date in local timezone reliably without shift
            const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
            return d.toLocaleDateString('es-CO');
        }
        return new Date(dateString).toLocaleDateString('es-CO');
    } catch {
        return typeof dateString === 'string' ? dateString : '-';
    }
}
