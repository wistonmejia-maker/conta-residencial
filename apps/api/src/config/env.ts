import { z } from 'zod';
import dotenv from 'dotenv';

// Load .env if present
dotenv.config();

const envSchema = z.object({
    // Server
    PORT: z.string().default('3002').transform(Number).or(z.number()),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    // Database
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

    // Google AI (Gemini)
    GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),

    // Google OAuth (Gmail)
    GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
    GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),
    GOOGLE_REDIRECT_URI: z.string().min(1, "GOOGLE_REDIRECT_URI is required"),

    // Cloudinary (Optional)
    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
    try {
        const result = envSchema.safeParse(process.env);
        if (!result.success) {
            const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
            console.error('⚠️ Environment validation failed:', issues);
            // Return process.env as any to allow the app to boot even with validation errors
            return process.env as any;
        }
        return result.data;
    } catch (err) {
        console.error('❌ Unexpected error during env validation:', err);
        return process.env as any;
    }
}

export const config = validateEnv();
