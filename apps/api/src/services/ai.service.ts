import { GoogleGenerativeAI } from '@google/generative-ai';
import prisma from '../lib/prisma';
import logger from '../lib/logger';
import { UnitContextService } from './unitContext.service';
import { AIRulesService } from './aiRules.service';
import { TelemetryService } from './telemetry.service';

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

/**
 * Helper to log Gemini metrics with error/success handling
 */
async function logMetric(args: {
    unitId?: string;
    startTime: number;
    requestType: 'CLASSIFICATION' | 'INSIGHTS' | 'CHAT';
    result?: any;
    error?: any;
}) {
    const latencyMs = Date.now() - args.startTime;
    const usage = args.result?.response?.usageMetadata;

    await TelemetryService.logGeminiMetric({
        unitId: args.unitId,
        modelName: 'gemini-2.0-flash',
        promptTokens: usage?.promptTokenCount || 0,
        completionTokens: usage?.candidatesTokenCount || 0,
        totalTokens: usage?.totalTokenCount || 0,
        latencyMs,
        status: args.error ? 'ERROR' : 'SUCCESS',
        errorMessage: args.error?.message,
        requestType: args.requestType
    }).catch(e => logger.error('Failed to log metric', { error: e.message }));
}

export async function classifyAndExtractDocument(
    fileBuffer: Buffer,
    mimeType: string,
    unitId: string
): Promise<{
    type: 'INVOICE' | 'PAYMENT_RECEIPT' | 'OTHER';
    data?: any;
}> {
    const startTime = Date.now();
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const { description: contextDescription } = await UnitContextService.getUnitContext(unitId);
        const dynamicRules = await AIRulesService.buildDynamicRulesFromDB(unitId);

        const prompt = `Analiza este documento y determina su tipo y extrae la información relevante. NO INVENTES INFORMACIÓN.

        ${contextDescription}
        
        ${dynamicRules}

        FORMATO DE RESPUESTA (JSON):
        Si es INVOICE:
        {
            "type": "INVOICE",
            "data": {
                "nit": "NIT del emisor",
                "providerName": "Nombre del emisor",
                "clientNit": "NIT del receptor/cliente",
                "invoiceNumber": "Número de factura",
                "totalAmount": 1000,
                "date": "YYYY-MM-DD",
                "concept": "Resumen corto (max 10 palabras) EXACTO de los servicios o trabajos facturados (ej: 'Mantenimiento ascensores', 'Vigilancia Enero', 'Insumos Aseo'). NO uses 'Pago factura' ni cosas genéricas."
            }
        }

        NOTAS SOBRE FECHAS:
        - Los documentos son de Colombia, por lo que las fechas impresas suelen ser DD/MM/YYYY. 
        - Por ejemplo, "02/01/2026" es el 2 de ENERO de 2026. 
        - DEBES retornar la fecha siempre en formato ISO YYYY-MM-DD.

        Si es PAYMENT_RECEIPT (Solo Egresos):
        {
            "type": "PAYMENT_RECEIPT",
            "data": {
                "bankName": "Nombre del banco origen",
                "transactionRef": "Número de aprobación/CUS",
                "totalAmount": 1000,
                "date": "YYYY-MM-DD",
                "concept": "Pago a [Nombre Proveedor] - [Concepto]"
            }
        }

        INSTRUCCIONES PARA RETENCIONES (Sugerencia Experta):
        Basado en el concepto y el monto base (subtotal), SUGIERE las retenciones aplicables según norma Colombia 2025:
        - UVT 2025: $49.799
        - Tarifas comunes: 
          - Compras (Base 27 UVT): 2.5% declarante
          - Servicios (Base 4 UVT): 4% (Persona Juridica), 6% (Natural)
          - Honorarios: 10% o 11%
        - Si la factura IMPRIME explícitamente la retención, úsala (TYPE="EXTRACTED").
        - Si no, CALCÚLALA/SUGIERELA (TYPE="SUGGESTED") si aplica por base.

        AGREGA ESTO AL OBJETO "data" (tanto para invoice como payment):
        "retentions": {
            "retefuente": { "amount": 0, "rate": 0, "type": "SUGGESTED" },
            "reteica": { "amount": 0, "rate": 0, "type": "SUGGESTED" }
        }

        Si es OTHER:
        { "type": "OTHER" }

        Responde SOLO el JSON.`;

        const result = await model.generateContent([
            prompt,
            { inlineData: { data: fileBuffer.toString('base64'), mimeType } },
        ]);

        await logMetric({ startTime, unitId, requestType: 'CLASSIFICATION', result });

        const text = result.response.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        return jsonMatch ? JSON.parse(jsonMatch[0]) : { type: 'OTHER' };
    } catch (error: any) {
        await logMetric({ startTime, unitId, requestType: 'CLASSIFICATION', error });
        logger.error('Error in classifyAndExtractDocument', { error: error.message });
        return { type: 'OTHER' };
    }
}

export async function extractBankTransactions(
    fileBuffer: Buffer,
    mimeType: string
): Promise<{ transactions: any[] }> {
    const startTime = Date.now();
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const prompt = `Analiza este extracto bancario (PDF, Imagen o Excel) y extrae TODAS las transacciones de la tabla principal.
        
        Extrae la siguiente información por cada fila:
        1. "date": Fecha en formato YYYY-MM-DD.
        2. "description": Texto descriptivo de la transacción.
        3. "amount": Valor numérico. Los débitos (salidas de dinero) deben ser NEGATIVOS. Los créditos deben ser POSITIVOS.
        4. "reference": Número de documento o referencia si está disponible.

        Ignora encabezados de página, pies de página o resúmenes de saldo. Solo queremos el detalle de movimientos.

        FORMATO DE RESPUESTA (JSON):
        {
            "transactions": [
                { "date": "2024-01-01", "description": "TRF PROVEEDOR 1", "amount": -150000, "reference": "12345" },
                ...
            ]
        }

        Responde SOLO el JSON.`;

        const result = await model.generateContent([
            prompt,
            { inlineData: { data: fileBuffer.toString('base64'), mimeType } },
        ]);
        await logMetric({ startTime, requestType: 'CLASSIFICATION', result });
        const text = result.response.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        return jsonMatch ? JSON.parse(jsonMatch[0]) : { transactions: [] };
    } catch (error: any) {
        await logMetric({ startTime, requestType: 'CLASSIFICATION', error });
        logger.error('Error in extractBankTransactions', { error: error.message });
        return { transactions: [] };
    }
}

export async function matchBankMovements(bankMovements: any[], pendingPayments: any[]): Promise<{ matches: any[] }> {
    const startTime = Date.now();
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const prompt = `Actúa como un contador experto. Cruza (concilia) la lista de movimientos bancarios con la lista de pagos pendientes registrados en la app.

        MOVIMIENTOS BANCARIOS:
        ${JSON.stringify(bankMovements.map(m => ({ id: m.id, date: m.transactionDate, desc: m.description, amount: m.amount })))}

        PAGOS PENDIENTES:
        ${JSON.stringify(pendingPayments.map(p => ({ id: p.id, date: p.paymentDate, provider: p.provider?.name, amount: p.netValue, consecutive: p.consecutiveNumber })))}

        CRITERIOS DE CRUCE:
        1. El monto debe ser casi idéntico (el banco registra negativo, la app positivo).
        2. La fecha debe ser cercana (generalmente el mismo día o 1-3 días de diferencia).
        3. La descripción del banco suele contener palabras clave del nombre del proveedor o números de referencia referenciados en los pagos.

        FORMATO DE RESPUESTA (JSON):
        {
            "matches": [
                { "bankMovementId": "ID_BANCO", "paymentId": "ID_PAGO", "confidence": 0.95, "reason": "Monto exacto y el nombre del proveedor EPM aparece en la descripción del banco" }
            ]
        }

        Responde SOLO el JSON.`;
        const result = await model.generateContent(prompt);
        await logMetric({ startTime, requestType: 'CLASSIFICATION', result });
        const text = result.response.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        return jsonMatch ? JSON.parse(jsonMatch[0]) : { matches: [] };
    } catch (error: any) {
        await logMetric({ startTime, requestType: 'CLASSIFICATION', error });
        return { matches: [] };
    }
}

export async function generateMonthlyInsights(month: number, year: number, expensesCurrently: any[], expensesAverage: any[], complianceIssues: any[]) {
    const startTime = Date.now();
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const monthName = new Date(year, month - 1).toLocaleString('es-CO', { month: 'long' });
        const prompt = `Actúa como un auditor contable experto en propiedad horizontal. 
        Analiza los datos financieros del mes de ${monthName} ${year} y genera un informe ejecutivo conciso.

        GASTOS DEL MES ACTUAL:
        ${JSON.stringify(expensesCurrently)}

        PROMEDIO DE GASTOS (ÚLTIMOS 3 MESES):
        ${JSON.stringify(expensesAverage)}

        PROBLEMAS DE CUMPLIMIENTO DETECTADOS:
        ${JSON.stringify(complianceIssues)}

        FORMATO DE RESPUESTA (JSON):
        {
            "summary": "Resumen...",
            "anomalies": ["Anomalía 1..."],
            "recommendations": ["Sugerencia 1..."]
        }

        Responde SOLO el JSON.`;
        const result = await model.generateContent(prompt);
        await logMetric({ startTime, requestType: 'INSIGHTS', result });
        const text = result.response.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        return jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: '', anomalies: [], recommendations: [] };
    } catch (error: any) {
        await logMetric({ startTime, requestType: 'INSIGHTS', error });
        return { summary: '', anomalies: [], recommendations: [] };
    }
}

export async function answerFinancialQuery(query: string, contextData: any): Promise<string> {
    const startTime = Date.now();
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const prompt = `Actúa como el CFO de un edificio residencial. 
        Datos (últimos 12 meses): ${JSON.stringify(contextData)}
        Usuario pregunta: "${query}"
        
        FORMATO OBLIGATORIO:
        - Usa Markdown.
        - SIEMPRE que listes datos, USA UNA TABLA MARKDOWN.
        - Sé conciso.`;
        const result = await model.generateContent(prompt);
        await logMetric({ startTime, requestType: 'CHAT', result });
        return result.response.text();
    } catch (error: any) {
        await logMetric({ startTime, requestType: 'CHAT', error });
        return "Lo siento, tuve un error al procesar tu consulta.";
    }
}

export async function analyzeReportData(reportTitle: string, dataPreview: any[]): Promise<string> {
    const startTime = Date.now();
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const prompt = `Actúa como un Auditor Contable Senior. Reporte: "${reportTitle}".
        Datos (Muestra 50 filas): ${JSON.stringify(dataPreview.slice(0, 50))}
        No inventes datos. Sé conciso.`;
        const result = await model.generateContent(prompt);
        await logMetric({ startTime, requestType: 'INSIGHTS', result });
        return result.response.text();
    } catch (error: any) {
        await logMetric({ startTime, requestType: 'INSIGHTS', error });
        return "Error al analizar el reporte.";
    }
}

export async function extractBudgetFromDocument(fileBuffer: Buffer, mimeType: string) {
    const startTime = Date.now();
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const prompt = `Actúa como un asistente contable detallista. Extrae todas las líneas de presupuesto (Categoría y Valor).
        FORMATO DE RESPUESTA (JSON):
        { "items": [ { "category": "...", "amount": 0 } ] }
        Responde SOLO el JSON.`;
        const result = await model.generateContent([{ inlineData: { data: fileBuffer.toString('base64'), mimeType } }, prompt]);
        await logMetric({ startTime, requestType: 'CLASSIFICATION', result });
        const text = result.response.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        return jsonMatch ? JSON.parse(jsonMatch[0]) : { items: [] };
    } catch (error: any) {
        await logMetric({ startTime, requestType: 'CLASSIFICATION', error });
        return { items: [] };
    }
}

export async function analyzeBudgetDeeply(month: number, year: number, summary: any[], topTransactions: any[]) {
    const startTime = Date.now();
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const monthName = new Date(year, month - 1).toLocaleString('es-CO', { month: 'long' });
        const prompt = `Actúa como un Controlador Financiero Experto. Analiza la Ejecución Presupuestal de ${monthName} ${year}.
        RESUMEN: ${JSON.stringify(summary)}
        TRANSACCIONES: ${JSON.stringify(topTransactions)}
        FORMATO JSON: { "alerts": [...], "analysis": "...", "forecast": "..." }
        Responde SOLO el JSON.`;
        const result = await model.generateContent(prompt);
        await logMetric({ startTime, requestType: 'INSIGHTS', result });
        const text = result.response.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        return jsonMatch ? JSON.parse(jsonMatch[0]) : { alerts: [], analysis: '', forecast: '' };
    } catch (error: any) {
        await logMetric({ startTime, requestType: 'INSIGHTS', error });
        return { alerts: [], analysis: '', forecast: '' };
    }
}

export async function logAIQuery(unitId: string, query: string, source: 'CHAT' | 'FEEDBACK' = 'CHAT') {
    try {
        // @ts-ignore
        await (prisma as any).aIQueryLog.create({ data: { unitId, query, source } });
    } catch (e: any) {
        logger.error('Failed to log AI query', { error: e.message });
    }
}

export async function getSuggestedQuestions(unitId: string): Promise<string[]> {
    try {
        // @ts-ignore
        const logs = await (prisma as any).aIQueryLog.findMany({
            where: { unitId },
            orderBy: { timestamp: 'desc' },
            take: 50
        });
        const frequency: Record<string, number> = {};
        logs.forEach((log: any) => {
            const q = log.query.trim();
            if (q.length > 4) frequency[q] = (frequency[q] || 0) + 1;
        });
        const sorted = Object.entries(frequency).sort((a, b) => b[1] - a[1]).map(([q]) => q).slice(0, 3);
        const defaults = ["¿Cuánto gasté este mes?", "¿Facturas pendientes?", "Comparar gastos vs mes anterior"];
        return sorted.length > 0 ? sorted : defaults;
    } catch (e) {
        return ["¿Cuánto gasté este mes?", "¿Facturas pendientes?", "Comparar gastos vs mes anterior"];
    }
}
