import { GoogleGenerativeAI } from '@google/generative-ai';
import prisma from '../lib/prisma';


import { UnitContextService } from './unitContext.service';
import { AIRulesService } from './aiRules.service';

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function classifyAndExtractDocument(
    fileBuffer: Buffer,
    mimeType: string,
    unitId: string
): Promise<{
    type: 'INVOICE' | 'PAYMENT_RECEIPT' | 'OTHER';
    data?: {
        // Common 
        totalAmount: number;
        date: string; // YYYY-MM-DD
        concept: string;

        // Invoice specific
        nit?: string;
        providerName?: string;
        clientNit?: string | null;
        invoiceNumber?: string;

        // Payment specific
        transactionRef?: string;
        bankName?: string;
    }
}> {
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
    });

    // 1. Fetch Dynamic Context (Prompt)
    const { description: contextDescription } = await UnitContextService.getUnitContext(unitId);

    // 2. Fetch Dynamic Rules from DB (NEW - Spec v3.0)
    const dynamicRules = await AIRulesService.buildDynamicRulesFromDB(unitId);

    const prompt = `Analiza este documento y determina su tipo y extrae la información relevante. NO INVENTES INFORMACIÓN.

    ${contextDescription}
    
    ${dynamicRules}  // Inyección dinámica desde DB

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

            "concept": "Pago a [Nombre Proveedor] - [Concepto]"
        }
    }

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
        "retefuente": { "amount": 0, "rate": 0, "type": "SUGGESTED" }, // type puede ser SUGGESTED o EXTRACTED
        "reteica": { "amount": 0, "rate": 0, "type": "SUGGESTED" }
    }

    Si es OTHER:
    { "type": "OTHER" }

    Responde SOLO el JSON.`;

    const result = await model.generateContent([
        prompt,
        {
            inlineData: {
                data: fileBuffer.toString('base64'),
                mimeType,
            },
        },
    ]);

    const text = result.response.text();

    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
    } catch (e) {
        console.error('Error parsing AI response:', e);
    }

    return { type: 'OTHER' };
}

export async function extractBankTransactions(
    fileBuffer: Buffer,
    mimeType: string
): Promise<{
    transactions: {
        date: string;
        description: string;
        amount: number;
        reference: string;
    }[]
}> {
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
    });

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
        {
            inlineData: {
                data: fileBuffer.toString('base64'),
                mimeType,
            },
        },
    ]);

    const text = result.response.text();

    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
    } catch (e) {
        console.error('Error parsing AI extraction response:', e);
    }

    return { transactions: [] };
}

export async function matchBankMovements(
    bankMovements: any[],
    pendingPayments: any[]
): Promise<{
    matches: {
        bankMovementId: string;
        paymentId: string;
        confidence: number;
        reason: string;
    }[]
}> {
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
    });

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
    const text = result.response.text();

    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
    } catch (e) {
        console.error('Error parsing AI matching response:', e);
    }

    return { matches: [] };
}

export async function generateMonthlyInsights(
    month: number,
    year: number,
    expensesCurrently: any[],
    expensesAverage: any[],
    complianceIssues: any[]
): Promise<{
    summary: string;
    anomalies: string[];
    recommendations: string[];
}> {
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
    });

    const monthName = new Date(year, month - 1).toLocaleString('es-CO', { month: 'long' });

    const prompt = `Actúa como un auditor contable experto en propiedad horizontal (edificios residenciales). 
    Analiza los datos financieros del mes de ${monthName} ${year} y genera un informe ejecutivo conciso para el Consejo de Administración.

    GASTOS DEL MES ACTUAL:
    ${JSON.stringify(expensesCurrently)}

    PROMEDIO DE GASTOS (ÚLTIMOS 3 MESES):
    ${JSON.stringify(expensesAverage)}

    PROBLEMAS DE CUMPLIMIENTO DETECTADOS:
    ${JSON.stringify(complianceIssues)}

    TAREAS:
    1. "summary": Un párrafo resumen profesional (2-3 oraciones) sobre el comportamiento del gasto este mes.
    2. "anomalies": Identifica variaciones significativas (>20%) comparando el mes actual con el promedio. Explica la posible causa si es evidente (ej: "Aumento en Mantenimiento").
    3. "recommendations": Sugerencias basadas en los problemas de cumplimiento (ej: "Solicitar RUT actualizado a X proveedor").

    FORMATO DE RESPUESTA (JSON):
    {
        "summary": "El gasto total del mes se mantuvo estable...",
        "anomalies": ["El rubro de Energía aumentó un 25% frente al promedio..."],
        "recommendations": ["Es crítico regularizar los soportes de pago de..."]
    }

    Responde SOLO el JSON.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
    } catch (e) {
        console.error('Error parsing AI insights response:', e);
    }

    return {
        summary: 'No se pudo generar el análisis automático.',
        anomalies: [],
        recommendations: []
    };
}

export async function answerFinancialQuery(
    query: string,
    contextData: any
): Promise<string> {
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
    });

    const prompt = `Actúa como un el CFO (Director Financiero) de un edificio residencial. 
    Tienes acceso a los siguientes datos financieros consolidados (últimos 12 meses):
    ${JSON.stringify(contextData)}

    El usuario (Administrador) pregunta: "${query}"

    Responde de forma clara, directa y profesional. Si la respuesta requiere cálculos (sumas, promedios), hazlos con precisión basándote en los datos json provistos.
    Si la pregunta no se puede responder con los datos disponibles, indícalo amablemente.
    
    FORMATO OBLIGATORIO:
    - Usa Markdown para dar formato.
    - SIEMPRE que listes datos (ej: lista de facturas, gastos por categoría, top proveedores), **USA UNA TABLA MARKDOWN**.
    - Usa negritas para resaltar montos totales y fechas clave.
    - Sé conciso.`;

    const result = await model.generateContent(prompt);
    return result.response.text();
}

export async function analyzeReportData(
    reportTitle: string,
    dataPreview: any[]
): Promise<string> {
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
    });

    const prompt = `Actúa como un Auditor Contable Senior. Estás revisando un reporte titulado: "${reportTitle}".
    
    DATOS DEL REPORTE (Muestra de las primeras 50 filas):
    ${JSON.stringify(dataPreview.slice(0, 50))}

    TAREA:
    Analiza estos datos y genera un breve informe (formato texto enriquecido con listas/negritas).
    1. **Resumen General**: ¿Qué estamos viendo?
    2. **Hallazgos Clave**: Tendencias, valores altos atípicos o patrones interesantes.
    3. **Conclusión**: ¿Está todo en orden o hay algo que requiere atención?

    No inventes datos. Si la muestra es muy pequeña, indícalo. Sé conciso.`;

    const result = await model.generateContent(prompt);
    return result.response.text();
}

export async function extractBudgetFromDocument(
    fileBuffer: Buffer,
    mimeType: string
): Promise<{
    items: { category: string; amount: number }[]
}> {
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
    });

    const prompt = `Actúa como un asistente contable detallista. Tienes un archivo de Presupuesto (PDF, Imagen o Excel) adjunto.
    Tu tarea es extraer todas las líneas de presupuesto (Categoría y Valor).

    INSTRUCCIONES:
    1. Identifica la tabla principal de rubros o gastos.
    2. Extrae el nombre de la categoría (ej: "Mantenimiento Locativo") y el valor mensual presupuestado.
    3. Si hay varias columnas de valores (ej: Ene, Feb, Mar), trata de identificar si es un presupuesto mensual único o promedio. Si es explícito por mes, extrae el valor general o del mes actual si se distingue. Para simplificar, asume que buscamos el valor mensual estándar.
    4. Ignora encabezados y totales.

    FORMATO DE RESPUESTA (JSON):
    {
        "items": [
            { "category": "Seguridad Física", "amount": 8500000 },
            { "category": "Aseo y Cafetería", "amount": 2500000 }
        ]
    }

    Responde SOLO el JSON.`;

    const result = await model.generateContent([
        prompt,
        {
            inlineData: {
                data: fileBuffer.toString('base64'),
                mimeType,
            },
        },
    ]);

    const text = result.response.text();

    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
    } catch (e) {
        console.error('Error parsing AI budget extraction response:', e);
    }

    return { items: [] };
}

export async function analyzeBudgetDeeply(
    month: number,
    year: number,
    summary: any[],
    topTransactions: any[]
): Promise<{
    alerts: string[];
    analysis: string;
    forecast: string;
}> {
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
    });

    const monthName = new Date(year, month - 1).toLocaleString('es-CO', { month: 'long' });

    const prompt = `Actúa como un Controlador Financiero Experto. Analiza la Ejecución Presupuestal de ${monthName} ${year}.
    
    RESUMEN DE EJECUCIÓN:
    ${JSON.stringify(summary)}

    TRANSACCIONES RELEVANTES (Top gastos por categoría):
    ${JSON.stringify(topTransactions)}

    TAREAS:
    1. **Alertas Críticas**: Identifica categorías con sobre-ejecución (>100%) o riesgo alto (>85%). Cita la transacción específica si es la culpable (ej: "Sobregiro en Mantenimiento impulsado por el pago de 'Reparación Motobomba'").
    2. **Análisis por Categoría**: Explica brevemente el comportamiento de los rubros principales.
    3. **Proyección**: Si estamos a mitad de mes (asume fecha actual), ¿estamos en riesgo de terminar en déficit general?

    FORMATO JSON:
    {
        "alerts": ["Alerta 1...", "Alerta 2..."],
        "analysis": "Texto enriquecido con el análisis detallado...",
        "forecast": "Breve proyección de cierre de mes..."
    }
    
    Responde SOLO el JSON.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
    } catch (e) {
        console.error('Error parsing AI budget analysis:', e);
    }

    return { alerts: [], analysis: "No se pudo generar el análisis.", forecast: "" };
}

export async function logAIQuery(unitId: string, query: string, source: 'CHAT' | 'FEEDBACK' = 'CHAT') {
    try {
        // @ts-ignore - Prisma client dynamic property
        await prisma.aiQueryLog.create({
            data: { unitId, query, source }
        });
    } catch (e) {
        console.error('Failed to log AI query:', e);
    }
}

export async function getSuggestedQuestions(unitId: string): Promise<string[]> {
    try {
        // Fetch last 50 queries
        // @ts-ignore - Prisma client dynamic property
        const logs = await prisma.aiQueryLog.findMany({
            where: { unitId },
            orderBy: { timestamp: 'desc' },
            take: 50,
            select: { query: true }
        });

        // Simple frequency analysis
        const frequency: Record<string, number> = {};
        logs.forEach((log: { query: string }) => {
            const q = log.query.trim();
            // Filter short queries or noise
            if (q.length > 4) {
                frequency[q] = (frequency[q] || 0) + 1;
            }
        });

        // Sort by frequency
        const sorted = Object.entries(frequency)
            .sort((a, b) => b[1] - a[1])
            .map(([q]) => q)
            .slice(0, 3); // Top 3

        if (sorted.length > 0) return sorted;

        // Default feedback if no history
        return [
            "¿Cuánto gasté este mes?",
            "¿Facturas pendientes?",
            "Compara gastos vs mes anterior"
        ];
    } catch (e) {
        console.error('Failed to get suggestions:', e);
        // Fallback defaults
        return [
            "¿Cuánto gasté este mes?",
            "¿Facturas pendientes?",
            "Compara gastos vs mes anterior"
        ];
    }
}
