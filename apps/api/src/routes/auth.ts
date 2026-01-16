import { Router } from 'express';
import { getAuthUrl, oauth2Client } from '../config/google';
import { google } from 'googleapis';
import prisma from '../lib/prisma';

const router = Router();

// 1. Redirect to Google Auth
router.get('/google', (req, res) => {
    const { unitId } = req.query;
    if (!unitId) {
        return res.status(400).send('Unit ID is required');
    }
    const url = getAuthUrl(unitId as string); // State = unitId
    res.redirect(url);
});

// 2. Callback URL
router.get('/google/callback', async (req, res) => {
    const { code, state: unitId } = req.query;

    if (!code || !unitId) {
        return res.status(400).send('Invalid request: missing code or state');
    }

    try {
        const { tokens } = await oauth2Client.getToken(code as string);
        oauth2Client.setCredentials(tokens);

        // Get user profile to save email
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const { data: userInfo } = await oauth2.userinfo.get();
        const email = userInfo.email;

        if (!email) throw new Error('Could not get email from Google');

        // Save tokens to DB
        await prisma.gmailToken.upsert({
            where: { unitId: unitId as string },
            create: {
                unitId: unitId as string,
                email,
                accessToken: tokens.access_token!,
                refreshToken: tokens.refresh_token!,
                expiresAt: BigInt(tokens.expiry_date!),
            },
            update: {
                email,
                accessToken: tokens.access_token!,
                refreshToken: tokens.refresh_token!, // Update refresh token if provided
                expiresAt: BigInt(tokens.expiry_date!),
            }
        });

        res.send(`
            <h1>Conexión Exitosa</h1>
            <p>Se ha conectado la cuenta <strong>${email}</strong> a la unidad.</p>
            <script>setTimeout(() => window.close(), 2000)</script>
        `);

    } catch (error) {
        console.error('Error in Google Auth:', error);
        res.status(500).send('Error durante la autenticación');
    }
});

export default router;
