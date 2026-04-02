import prisma from '../lib/prisma';
import logger from '../lib/logger';

export class ProviderService {
    /**
     * Limpia un NIT dejando solo los números.
     * Si el resultado tiene 10 dígitos y empieza por 8 o 9 (común en NITs de empresas), 
     * es probable que el último sea un DV y lo removemos para la base.
     */
    static normalizeNit(nit: string): string {
        if (!nit) return '';
        let clean = nit.replace(/[^0-9]/g, '');
        
        // Si tiene 10 dígitos y parece un NIT de empresa (empieza por 8 o 9), 
        // el último es probablemente el DV que se "pegó" al limpiar.
        if (clean.length === 10 && (clean.startsWith('8') || clean.startsWith('9'))) {
            return clean.substring(0, 9);
        }
        
        // Para Homecenter 800.242.106-2 -> 8002421062 -> 800242106 (9)
        return clean;
    }

    /**
     * Calcula el Dígito de Verificación (DV) oficial para un NIT colombiano
     */
    static calculateDV(nit: string): string {
        const cleanNit = this.normalizeNit(nit);
        if (!cleanNit) return '0';

        const primos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
        let suma = 0;

        for (let i = 0; i < cleanNit.length; i++) {
            suma += parseInt(cleanNit[cleanNit.length - 1 - i]) * primos[i];
        }

        const residuo = suma % 11;
        if (residuo === 0 || residuo === 1) return residuo.toString();
        return (11 - residuo).toString();
    }

    /**
     * Limpia un string de email para extraer solo la dirección (ej: "Name <email@..." -> "email@...")
     */
    static cleanEmail(emailStr: string | null | undefined): string | null {
        if (!emailStr) return null;
        
        // Match content inside < > if present
        const match = emailStr.match(/<([^>]+)>/);
        if (match && match[1]) {
            return match[1].trim().toLowerCase();
        }
        
        return emailStr.trim().toLowerCase();
    }

    /**
     * Busca un proveedor por NIT (normalizado) o lo crea si no existe
     */
    static async findOrCreateProvider(data: {
        nit: string;
        name: string;
        email?: string | null;
        taxType?: string;
    }) {
        const cleanNit = this.normalizeNit(data.nit);
        const cleanEmail = this.cleanEmail(data.email);
        const dv = this.calculateDV(cleanNit);

        // Intentar buscar por NIT limpio
        let provider = await prisma.provider.findFirst({
            where: { nit: cleanNit }
        });

        if (!provider) {
            logger.info(`Creating new provider: ${data.name} (NIT: ${cleanNit})`);
            provider = await prisma.provider.create({
                data: {
                    name: data.name,
                    nit: cleanNit,
                    dv: dv,
                    taxType: data.taxType || 'NIT',
                    email: cleanEmail
                }
            });
        } else {
            // Opcional: Actualizar email si el existente es nulo
            if (!provider.email && cleanEmail) {
                await prisma.provider.update({
                    where: { id: provider.id },
                    data: { email: cleanEmail }
                });
            }
        }

        return provider;
    }
}
