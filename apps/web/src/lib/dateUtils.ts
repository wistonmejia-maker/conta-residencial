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
