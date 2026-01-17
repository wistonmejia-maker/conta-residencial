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
    console.log('Generated Google Auth URL:', url);
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

        // CHECK: Ensure this email is not used by another unit
        const existingToken = await prisma.gmailToken.findFirst({
            where: { email }
        });

        if (existingToken && existingToken.unitId !== unitId) {
            return res.status(400).send(`
                <h1 style="color: #e53e3e">Error de Conexión</h1>
                <p>La cuenta <strong>${email}</strong> ya está conectada a otro conjunto.</p>
                <p>Por favor, usa una cuenta de correo única para cada unidad residencial.</p>
                <button onclick="window.close()" style="margin-top: 10px; cursor: pointer;">Cerrar Ventana</button>
            `);
        }

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
        res.status(500).send(`
            <h1>Error durante la autenticación</h1>
            <p>Ocurrió un error al intentar conectar con Google:</p>
            <pre style="background: #f5f5f5; padding: 10px; border-radius: 5px;">${error instanceof Error ? error.message : JSON.stringify(error)}</pre>
            <p>Por favor, cierra esta ventana e intenta de nuevo. Si el error persiste, contacta soporte.</p>
        `);
    }
});


// 3. Check Connection Status
router.get('/status', async (req, res) => {
    const { unitId } = req.query;
    if (!unitId) return res.status(400).send({ error: 'Unit ID is required' });

    try {
        const token = await prisma.gmailToken.findUnique({
            where: { unitId: unitId as string }
        });

        if (token) {
            res.json({ connected: true, email: token.email });
        } else {
            res.json({ connected: false });
        }
    } catch (error) {
        console.error('Error checking Gmail status:', error);
        res.status(500).json({ error: 'Error checking status' });
    }
});

// 4. Disconnect Gmail
router.delete('/google', async (req, res) => {
    const { unitId } = req.query;
    if (!unitId) return res.status(400).send({ error: 'Unit ID is required' });

    try {
        await prisma.gmailToken.deleteMany({
            where: { unitId: unitId as string }
        });
        res.json({ success: true, message: 'Gmail disconnected successfully' });
    } catch (error) {
        console.error('Error disconnecting Gmail:', error);
        res.status(500).json({ error: 'Error disconnecting Gmail' });
    }
});

export default router;
