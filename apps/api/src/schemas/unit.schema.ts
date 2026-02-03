import { z } from 'zod';

export const unitSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    taxId: z.string().min(1, 'Tax ID is required'),
    address: z.string().optional().nullable(),
    email: z.string().email().optional().nullable().or(z.literal('')),
    logoUrl: z.string().url().optional().nullable().or(z.literal('')),
    observations: z.string().optional().nullable(),
    bankAccountInfo: z.string().optional().nullable(),
    propertyType: z.enum(['RESIDENTIAL', 'COMMERCIAL', 'MIXED']).default('RESIDENTIAL'),
    totalTowers: z.number().int().positive().optional().nullable(),
    totalUnits: z.number().int().positive().optional().nullable(),
    defaultPaymentType: z.enum(['INTERNAL', 'EXTERNAL']).default('INTERNAL'),
    consecutiveSeed: z.number().int().min(1).default(1),
    accountantId: z.string().uuid().optional().nullable().or(z.literal('')),
    adminId: z.string().uuid().optional().nullable().or(z.literal('')),
    fiscalRevisorId: z.string().uuid().optional().nullable().or(z.literal('')),
    gmailScanStartDate: z.string().optional().nullable().or(z.literal('')),
    gmailProcessedLabel: z.string().optional().default('Procesado'),
    gmailLabelingEnabled: z.boolean().optional().default(true),
    gmailScanDaysBack: z.number().int().min(1).optional().default(7),
    gmailAutoScanEnabled: z.boolean().optional().default(false),
    defaultElaboratedBy: z.string().optional().nullable(),
    defaultReviewedBy: z.string().optional().nullable(),
    defaultApprovedBy: z.string().optional().nullable(),
    defaultBankName: z.string().optional().nullable(),
    defaultAccountType: z.string().optional().nullable()
});

export type UnitInput = z.infer<typeof unitSchema>;
