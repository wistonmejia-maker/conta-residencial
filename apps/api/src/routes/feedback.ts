import { Router } from 'express';
import prisma from '../lib/prisma';
import fs from 'fs';
import path from 'path';

const router = Router();

// POST /api/feedback
router.post('/', async (req, res) => {
    const { unitId, documentType, referenceId, comment, suggestedRule, invoiceId, paymentId } = req.body;

    if (!unitId || !comment) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        // 1. Save to Database
        const feedback = await prisma.aIFeedback.create({
            data: {
                unitId,
                documentType,
                invoiceId: invoiceId || (documentType === 'INVOICE' ? referenceId : undefined),
                paymentId: paymentId || (documentType === 'PAYMENT' ? referenceId : undefined),
                comment,
                suggestedRule,
                status: 'PENDING'
            }
        });

        // 2. Append to AI_RULES.md
        // We will append a new entry in the "Feedback Loop" section
        const rulesPath = path.join(process.cwd(), '../../../AI_RULES.md'); // Adjust path to root

        let ruleEntry = `\n\n### Feedback ID: ${feedback.id} (${new Date().toISOString()})\n`;
        ruleEntry += `- **Tipo**: ${documentType}\n`;
        ruleEntry += `- **Comentario**: ${comment}\n`;
        if (suggestedRule) {
            ruleEntry += `- **Regla Sugerida**: ${suggestedRule}\n`;
        }
        ruleEntry += `- **Estado**: PENDING\n`;

        try {
            // Check if file exists, if so append, else create (though it should exist)
            if (fs.existsSync(rulesPath)) {
                fs.appendFileSync(rulesPath, ruleEntry);
            } else {
                // Try alternate path if we are deeper or shallower
                const altPath = path.join(process.cwd(), '../../AI_RULES.md');
                if (fs.existsSync(altPath)) {
                    fs.appendFileSync(altPath, ruleEntry);
                }
            }
        } catch (err) {
            console.error('Error updating AI_RULES.md:', err);
            // Non-critical error, continue
        }

        res.json({ success: true, feedback });
    } catch (error: any) {
        console.error('Error saving feedback:', error);
        res.status(500).json({ error: 'Error saving feedback' });
    }
});

export default router;
