// Load environment variables FIRST, before any other imports
import dotenv from 'dotenv'
dotenv.config()

import express from 'express'
import cors from 'cors'
import { config } from './config/env' // Validate env vars
import path from 'path'

// Routes
import unitsRouter from './routes/units'
import providersRouter from './routes/providers'
import invoicesRouter from './routes/invoices'
import paymentsRouter from './routes/payments'
import bankRouter from './routes/bank'
import alertsRouter from './routes/alerts'
import filesRouter from './routes/files'
import providerConfigsRouter from './routes/providerConfigs'
import searchRouter from './routes/search'
import reportsRouter from './routes/reports'
import aiRouter from './routes/ai'
import budgetsRouter from './routes/budgets'
import authRouter from './routes/auth'
import scanRouter from './routes/scan'

const app = express()
const PORT = process.env.PORT || 3002

// Middleware
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5181',
    'https://conta-residencial.vercel.app'
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

app.use(express.json())

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, '../uploads')))

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'ContaResidencial API', timestamp: new Date().toISOString() })
})

// Debug endpoint to check environment variables
app.get('/api/debug-env', (req, res) => {
    const dbUrl = process.env.DATABASE_URL
    res.json({
        DATABASE_URL_exists: !!dbUrl,
        DATABASE_URL_length: dbUrl?.length || 0,
        DATABASE_URL_starts_with_postgresql: dbUrl?.startsWith('postgresql://'),
        DATABASE_URL_first_30_chars: dbUrl?.substring(0, 30) || 'NOT SET',
        PORT: process.env.PORT,
        NODE_ENV: process.env.NODE_ENV,
        GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
        GOOGLE_CLIENT_ID_exists: !!process.env.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_ID_length: process.env.GOOGLE_CLIENT_ID?.length || 0,
        GOOGLE_CLIENT_SECRET_exists: !!process.env.GOOGLE_CLIENT_SECRET,
        GEMINI_API_KEY_exists: !!process.env.GEMINI_API_KEY,
        CLOUDINARY_CLOUD_NAME_exists: !!process.env.CLOUDINARY_CLOUD_NAME
    })
})

// API Routes
app.use('/api/units', unitsRouter)
app.use('/api/providers', providersRouter)
app.use('/api/auth', authRouter)
app.use('/api/invoices', scanRouter) // Register scanRouter FIRST to handle /scan-gmail
app.use('/api/invoices', invoicesRouter)
app.use('/api/payments', paymentsRouter)
app.use('/api/bank', bankRouter)
app.use('/api/alerts', alertsRouter)
app.use('/api/files', filesRouter)
app.use('/api/provider-configs', providerConfigsRouter)
app.use('/api/search', searchRouter)
app.use('/api/reports', reportsRouter)
app.use('/api/ai', aiRouter)
app.use('/api/budgets', budgetsRouter)

// Start server
app.listen(PORT, () => {
    console.log(`🚀 ContaResidencial API running on http://localhost:${PORT}`)
})

