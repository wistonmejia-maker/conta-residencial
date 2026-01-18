import { z } from 'zod';

export const createProviderSchema = z.object({
    name: z.string().min(3, "El nombre debe tener al menos 3 caracteres"),
    taxType: z.enum(['NIT', 'CC', 'CE', 'RUT'], { message: "Tipo de documento inválido" }),
    nit: z.string().min(5, "El NIT/Documento es requerido").max(20),
    dv: z.string().max(1).optional().default(""), // Digito de verificación
    email: z.string().email("Email inválido").optional().or(z.literal("")),
    phone: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    bankAccount: z.string().optional(),
    bankName: z.string().optional(),
    accountType: z.enum(['AHORROS', 'CORRIENTE']).optional(),
    defaultRetefuentePerc: z.number().min(0).max(100).optional().default(0),
    defaultReteicaPerc: z.number().min(0).max(100).optional().default(0),
    isRecurring: z.boolean().optional().default(false),
    recurringCategory: z.string().optional(),
    category: z.string().optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional().default('ACTIVE'),
});

export const updateProviderSchema = createProviderSchema.partial();
