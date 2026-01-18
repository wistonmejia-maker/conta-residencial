import { GoogleGenerativeAI } from '@google/generative-ai';
import prisma from '../lib/prisma';

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Helper to get dynamic rules from DB
async function getDynamicRules(): Promise<string> {
    try {
        const rules = await prisma.aIFeedback.findMany({
            where: {
                suggestedRule: { not: null },
                // You might want to filter by status='APPLIED' later, but for now take all to support "immediate" feedback
            },
            select: { suggestedRule: true }
        });

        if (rules.length === 0) return "";

        return rules
            .map(r => r.suggestedRule)
            .filter(r => r && r.trim().length > 0)
            .map(r => `- ${r}`)
            .join('\n');
    } catch (error) {
        console.warn("Could not fetch dynamic AI rules:", error);
        return "";
    }
}

export async function classifyAndExtractDocument(
    fileBuffer: Buffer,
    mimeType: string
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

    // 1. Fetch Dynamic Rules
    const dynamicRules = await getDynamicRules();

    const prompt = `Analiza este documento y determina su tipo y extrae la información relevante. NO INVENTES INFORMACIÓN.

    CONTEXTO:
    Eres el asistente contable de un Conjunto Residencial. Tu trabajo es procesar GASTOS (Salidas de dinero).
    El conjunto tiene cuenta en Banco AV Villas.

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
    - **MUY IMPORTANTE**: Si el EMISOR del documento (encabezado) es el propio conjunto (ej: "CONJUNTO RESIDENCIAL TREVISO", "CIUDAD JARDÍN") y le está cobrando a una persona ("Señor Propietario"), eso es una CUENTA DE COBRO DE ADMINISTRACIÓN (Ingreso). CLASIFÍCALO COMO "OTHER". Solo procesa facturas donde un TERCERO le cobra al conjunto.
    
    ${dynamicRules ? `
    REGLAS DE APRENDIZAJE (Exclusiones dinámicas):
    Las siguientes son reglas específicas aprendidas de feedback previo. APLÍCALAS CON PRIORIDAD:
    ${dynamicRules}
    ` : ''}

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
            "concept": "Genera una descripción profesional basada en los ítems."
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
    
    Tu respuesta debe ser solo texto plano (puedes usar listas o negritas markdown si ayuda a la legibilidad).`;

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
