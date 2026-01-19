import prisma from '../lib/prisma';

/**
 * Service for managing AI rules from database
 * Implements dynamic rule injection for Gemini prompts (Spec v3.0)
 */
export class AIRulesService {
    /**
     * Construye las reglas personalizadas desde la DB para inyectar en el prompt
     * @param unitId - ID de la unidad
     * @returns String con reglas formateadas para el prompt, o string vacío si no hay reglas
     */
    static async buildDynamicRulesFromDB(unitId: string): Promise<string> {
        const feedbackRules = await prisma.aIFeedback.findMany({
            where: {
                unitId,
                status: { in: ['APPLIED', 'PENDING'] } // Solo reglas activas
            },
            orderBy: { createdAt: 'desc' },
            take: 50 // Limitar para no exceder token limits de Gemini
        });

        if (feedbackRules.length === 0) {
            return '';
        }

        const rulesText = feedbackRules
            .map((f, idx) => `${idx + 1}. ${f.suggestedRule || f.comment}`)
            .join('\n');

        return `
REGLAS DE NEGOCIO PERSONALIZADAS (Aprendidas de Feedback):
Las siguientes son reglas específicas de esta unidad. APLÍCALAS CON PRIORIDAD:
${rulesText}
`;
    }

    /**
     * Migra reglas existentes de AI_RULES.md a la base de datos
     * @param unitId - ID de la unidad
     * @param rules - Array de reglas en texto
     */
    static async migrateRulesFromFile(unitId: string, rules: string[]): Promise<void> {
        for (const rule of rules) {
            await prisma.aIFeedback.create({
                data: {
                    unitId,
                    documentType: 'GENERAL',
                    comment: 'Migrado desde AI_RULES.md',
                    suggestedRule: rule,
                    status: 'APPLIED'
                    // Note: version field will be added after running SQL migration
                }
            });
        }
    }

    /**
     * Obtiene estadísticas de reglas por unidad
     */
    static async getRulesStats(unitId: string) {
        const total = await prisma.aIFeedback.count({ where: { unitId } });
        const active = await prisma.aIFeedback.count({
            where: { unitId, status: { in: ['APPLIED', 'PENDING'] } }
        });
        const resolved = await prisma.aIFeedback.count({
            where: { unitId, status: 'RESOLVED' }
        });

        return { total, active, resolved };
    }
}
