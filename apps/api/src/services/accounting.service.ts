import { Decimal } from '@prisma/client/runtime/library';

// Constants for 2025 (Projected/Current)
export const TAX_CONSTANTS = {
    UVT_2025: 49799, // Valor UVT 2025 oficial aproximado
    BASES: {
        SERVICIOS: 4, // 4 UVT
        COMPRAS: 27,  // 27 UVT
        HONORARIOS: 0 // 100% base
    },
    RATES: {
        SERVICIOS_DECLARANTE: 4,
        SERVICIOS_NO_DECLARANTE: 6,
        COMPRAS: 2.5,
        HONORARIOS: 11 // or 10
    }
};

export class AccountingService {

    /**
     * Calcula la Retención en la Fuente basada en reglas colombianas.
     * @param subtotal Monto antes de IVA
     * @param providerInfo Información del proveedor (retefuente % configurada, tipo, etc)
     * @param category Categoría del servicio/compra (opcional)
     */
    static calculateRetefuente(
        subtotal: number,
        providerInfo: {
            defaultRetefuentePerc?: number | Decimal | null,
            taxType?: string
        },
        category: 'SERVICIOS' | 'COMPRAS' | 'HONORARIOS' | 'GENERAL' = 'GENERAL'
    ): number {
        const uvtValue = TAX_CONSTANTS.UVT_2025;
        let rate = 0;
        let baseUVT = 0;

        // 1. If Provider has a specific default percentage, prioritize it (assuming manual config is source of truth)
        // But we still assume the Base check logic applies unless it's explicitly 0 (exempt).
        if (providerInfo.defaultRetefuentePerc && Number(providerInfo.defaultRetefuentePerc) > 0) {
            rate = Number(providerInfo.defaultRetefuentePerc);

            // Determine Base based on likely category or default to Service (4 UVT) as most common in residential
            // If the rate is 2.5%, it's likely COMPRAS. If 4, 6, 10, 11, likely SERVICIOS/HONORARIOS.
            if (rate === 2.5) {
                baseUVT = TAX_CONSTANTS.BASES.COMPRAS;
            } else if (rate >= 10) {
                baseUVT = TAX_CONSTANTS.BASES.HONORARIOS;
            } else {
                baseUVT = TAX_CONSTANTS.BASES.SERVICIOS;
            }
        } else {
            // 2. Auto-detect based on category if no default provided
            // For now, in "pure" mode without input, we might default to 0 or safe defaults.
            // Copropiedades mostly deal with Services (Vigilancia, Aseo, Mantenimiento).
            // Defaulting to 4% (Service Declarante) if not specified is a reasonable "suggestion", 
            // but risky to auto-apply without confirmation. 
            // Strategy: Return 0 if no config. The user asked to "validate and recalculate", 
            // implying if we HAVE data, ensure it's correct.
            return 0;
        }

        // 3. Validate Base
        const threshold = baseUVT * uvtValue;
        if (subtotal >= threshold) {
            // Apply Tax
            // Return rounded to 0 decimals (Pesos colombianos usually rounded)
            return Math.round(subtotal * (rate / 100));
        }

        return 0;
    }

    /**
     * Calcula ReteICA.
     * ReteICA depends heavily on Municipality. Assuming Bogota/General logic or provider config.
     */
    static calculateReteica(
        subtotal: number,
        providerInfo: {
            defaultReteicaPerc?: number | Decimal | null
        }
    ): number {
        // Base for ReteICA in many places is same as Retefuente or 100% depending on Estatuto Municipal.
        // Usually 4 UVT for services.
        const uvtValue = TAX_CONSTANTS.UVT_2025;
        const baseUVT = TAX_CONSTANTS.BASES.SERVICIOS; // Safe default
        const threshold = baseUVT * uvtValue;

        if (providerInfo.defaultReteicaPerc && Number(providerInfo.defaultReteicaPerc) > 0) {
            if (subtotal >= threshold) {
                // Rate is usually distinct (e.g. 9.66 per thousand). 
                // If stored as Percentage (e.g. 0.966%), divide by 100. 
                // If stored as "per thousand" (9.66), divide by 1000.
                // Our schema says "Perc" and example says 0 or default. 
                // Assuming it's stored as PERCENTAGE (e.g. 0.966 for 9.66/1000).
                const rate = Number(providerInfo.defaultReteicaPerc);
                return Math.round(subtotal * (rate / 100));
            }
        }

        return 0;
    }
}
