/**
 * Cron Scanner Service
 * 
 * This lightweight service is designed to be triggered by Railway's cron scheduler.
 * It calls the auto-scan endpoint and then exits immediately.
 * 
 * Railway Cron Configuration:
 * - Schedule: 0 * * * * (every hour at minute 0)
 * - Or: */30 * * * * (every 30 minutes)
 * 
 * Environment Variables Required:
 * - API_URL: Base URL of the API(e.g., https://conta-residencial-production.up.railway.app)
 * - CRON_SECRET: Secret key to authenticate cron requests
 */

const API_URL = process.env.API_URL || 'https://conta-residencial-production.up.railway.app';
const CRON_SECRET = process.env.CRON_SECRET || '';

async function triggerAutoScan() {
    console.log(`[Cron] Starting auto-scan trigger at ${new Date().toISOString()}`);
    console.log(`[Cron] API URL: ${API_URL}`);

    try {
        const response = await fetch(`${API_URL}/api/scan/cron/scan-all`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-cron-secret': CRON_SECRET
            }
        });

        const data = await response.json();

        if (response.ok) {
            console.log(`[Cron] ✅ Success:`, JSON.stringify(data, null, 2));
        } else {
            console.error(`[Cron] ❌ Error (${response.status}):`, JSON.stringify(data, null, 2));
            process.exit(1);
        }
    } catch (error) {
        console.error(`[Cron] ❌ Request failed:`, error.message);
        process.exit(1);
    }

    console.log(`[Cron] Completed at ${new Date().toISOString()}`);
    process.exit(0);
}

// Execute immediately
triggerAutoScan();
