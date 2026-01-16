import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function classifyAndExtractInvoice(
    fileBuffer: Buffer,
    mimeType: string
): Promise<{
    isInvoice: boolean;
    data?: {
        nit: string;
        providerName: string;
        invoiceNumber: string;
        totalAmount: number;
        issueDate: string; // YYYY-MM-DD
        concept: string;
    }
}> {
    const model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash', // Using faster model
    });

    const prompt = `Analiza este documento y determina si es una FACTURA o CUENTA DE COBRO válida en Colombia.
    
    Si NO es una factura, responde JSON: { "isInvoice": false }
    
    Si ES una factura, extrae los siguientes datos en JSON:
    {
        "isInvoice": true,
        "data": {
            "nit": "NIT o CC del emisor (solo números y guiones)",
            "providerName": "Nombre del emisor",
            "invoiceNumber": "Número de factura",
            "totalAmount": 0 (número, el total a pagar),
            "issueDate": "YYYY-MM-DD",
            "concept": "Descripción corta del servicio/producto"
        }
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
        console.error('Error parsing AI response:', e);
    }

    return { isInvoice: false };
}
