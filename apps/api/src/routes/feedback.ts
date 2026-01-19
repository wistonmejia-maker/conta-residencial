import { Router } from 'express';
import prisma from '../lib/prisma';
import fs from 'fs';
import path from 'path';
import { createFeedbackSchema } from '../schemas/feedback.schema';

const router = Router();

// POST /api/feedback
router.post('/', async (req, res) => {
    try {
        const body = createFeedbackSchema.parse(req.body);
        const { unitId, documentType, referenceId, comment, suggestedRule, invoiceId, paymentId } = body;

        // 1. Save to Database
        const feedback = await prisma.aIFeedback.create({
            data: {
                unitId,
                documentType,
                invoiceId: invoiceId || (documentType === 'INVOICE' && referenceId ? referenceId : undefined),
                paymentId: paymentId || (documentType === 'PAYMENT' && referenceId ? referenceId : undefined),
                comment,
                suggestedRule,
                status: 'PENDING'
            }
        });

        // 2. Append to AI_RULES.md (Best Effort)
        try {
            const rulesPath = path.join(process.cwd(), '../../../AI_RULES.md'); // Adjust path to root
            let ruleEntry = `\n\n### Feedback ID: ${feedback.id} (${new Date().toISOString()})\n`;
            ruleEntry += `- **Tipo**: ${documentType}\n`;
            ruleEntry += `- **Comentario**: ${comment}\n`;
            if (suggestedRule) {
                ruleEntry += `- **Regla Sugerida**: ${suggestedRule}\n`;
            }
            ruleEntry += `- **Estado**: PENDING\n`;

            // Try alternate path if we are deeper or shallower
            const altPath = path.join(process.cwd(), '../../AI_RULES.md');

            if (fs.existsSync(rulesPath)) {
                fs.appendFileSync(rulesPath, ruleEntry);
            } else if (fs.existsSync(altPath)) {
                fs.appendFileSync(altPath, ruleEntry);
            }
        } catch (err) {
            console.error('Error updating AI_RULES.md:', err);
            // Non-critical error, continue
        }

        res.json({ success: true, feedback });
    } catch (error: any) {
        if (error.name === 'ZodError') {
            return res.status(400).json({ error: 'Validation Error', details: error.errors });
        }
        console.error('Error saving feedback:', error);
        res.status(500).json({ error: 'Error saving feedback' });
    }
});

export default router;
