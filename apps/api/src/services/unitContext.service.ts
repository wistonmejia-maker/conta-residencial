import prisma from '../lib/prisma';

export interface UnitAIContext {
    unitName: string;
    description: string;
    rules: string; // Combined rules for the prompt
}

const MASTER_TEMPLATE = `Eres el asistente contable de un Conjunto Residencial. Tu trabajo es procesar GASTOS (Salidas de dinero).
    
    TIPOS SOPORTADOS:
    1. "INVOICE": Facturas de venta o Cuentas de cobro emitidas POR PROVEEDORES hacia el conjunto.
    2. "PAYMENT_RECEIPT": Comprobantes de EGRESO o TRANSFERENCIA (Salidas de dinero desde la cuenta del conjunto hacia un tercero).
       - IMPORTANTE: Debe ser dinero COMPROBADO que SALIÓ de la cuenta.
    3. "OTHER": Cualquier otro documento, incluyendo:
       - Recibos de CAJA o RECAUDO (Dinero que ENTRA al conjunto).
       - Consignaciones de residentes o propietarios (Pagos de administración).
       - Estados de cuenta.

    REGLA DE EXCLUSIÓN CRÍTICA (TIPO "OTHER"):
    - Si el documento dice "COMPROBANTE DE RECAUDO", "CONSIGNACIÓN", "DEPÓSITO".
    - Si muestra que un residente (ej: "Apto 501", "Torre A") le pagó al conjunto.
    - **MUY IMPORTANTE**: Si el EMISOR del documento (encabezado) es el propio conjunto y le está cobrando a una persona ("Señor Propietario"), eso es una CUENTA DE COBRO DE ADMINISTRACIÓN (Ingreso). CLASIFÍCALO COMO "OTHER". Solo procesa facturas donde un TERCERO le cobra al conjunto.`;

export class UnitContextService {

    static async getUnitContext(unitId: string): Promise<UnitAIContext> {
        // 1. Fetch Unit to get custom prompt and details
        const unit = await prisma.unit.findUnique({
            where: { id: unitId },
            select: {
                name: true,
                aiCustomPrompt: true
            }
        });

        if (!unit) {
            throw new Error(`Unit with ID ${unitId} not found`);
        }

        // 2. Fetch Dynamic Rules (AI Feedback)
        const rules = await prisma.aIFeedback.findMany({
            where: {
                unitId: unitId,
                suggestedRule: { not: null },
            },
            select: { suggestedRule: true }
        });

        const formattedRules = rules.length > 0
            ? rules
                .map(r => r.suggestedRule)
                .filter(r => r && r.trim().length > 0)
                .map(r => `- ${r}`)
                .join('\n')
            : "";

        // 3. Determine base context (Custom vs Master)
        const baseContext = unit.aiCustomPrompt && unit.aiCustomPrompt.trim().length > 0
            ? unit.aiCustomPrompt
            : MASTER_TEMPLATE;

        // 4. Inject Unit Name if using Master Template (optional, simple replacement)
        // If master template mentions "CONJUNTO RESIDENCIAL", we might want to be specific, 
        // but for now we basically append the Identity.

        const fullContext = `CONTEXTO:
    Eres el asistente contable del conjunto: ${unit.name}.
    ${baseContext}`;

        return {
            unitName: unit.name,
            description: fullContext,
            rules: formattedRules
        };
    }
}
