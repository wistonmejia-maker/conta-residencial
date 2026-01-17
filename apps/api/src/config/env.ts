import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from the root of the api package
dotenv.config();

const envSchema = z.object({
    // Server
    PORT: z.string().default('3002').transform(Number),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    // Database
    DATABASE_URL: z.string().url(),

    // Google AI (Gemini)
    GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),

    // Google OAuth (Gmail)
    GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
    GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),
    GOOGLE_REDIRECT_URI: z.string().url(),

    // Cloudinary (Optional)
    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
    try {
        return envSchema.parse(process.env);
    } catch (err) {
        if (err instanceof z.ZodError) {
            const missingVars = err.issues.map((e: z.ZodIssue) => e.path.join('.')).join(', ');
            console.error('❌ Invalid environment variables:', missingVars);
            process.exit(1);
        }
        throw err;
    }
}

export const config = validateEnv();
