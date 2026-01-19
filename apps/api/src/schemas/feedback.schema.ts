import { z } from 'zod';

export const createFeedbackSchema = z.object({
    unitId: z.string().uuid(),
    documentType: z.enum(['INVOICE', 'PAYMENT', 'OTHER']),
    comment: z.string().min(3, "Comment must be at least 3 characters"),
    suggestedRule: z.string().optional(),

    // Optional relations
    invoiceId: z.string().uuid().optional(),
    paymentId: z.string().uuid().optional(),

    // Legacy/Frontend convenience fields (will be mapped to invoiceId/paymentId)
    referenceId: z.string().optional()
});

export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;
