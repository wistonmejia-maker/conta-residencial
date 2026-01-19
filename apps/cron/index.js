/**
 * Cron Scanner Service
 * 
 * This lightweight service is designed to be triggered by Railway's cron scheduler.
 * It calls the auto-scan endpoint and then exits immediately.
 * 
 * Railway Cron Configuration:
 * - Schedule: 0 * * * * (every hour at minute 0)
 * - Or: *\/30 * * * * (every 30 minutes)
 * 
 * Environment Variables Required:
 * - API_URL: Base URL of the API (e.g., https://conta-residencial-production.up.railway.app)
 * - CRON_SECRET: Secret key to authenticate cron requests
 */

const API_URL = process.env.API_URL || 'https://conta-residencial-production.up.railway.app';
const CRON_SECRET = process.env.CRON_SECRET || '';

// Mask secret for logging
const MASKED_SECRET = CRON_SECRET ? `${CRON_SECRET.substring(0, 3)}...${CRON_SECRET.substring(CRON_SECRET.length - 3)}` : '(empty)';

async function triggerAutoScan() {
    console.log(`[Cron] Starting auto-scan trigger at ${new Date().toISOString()}`);
    console.log(`[Cron] Target API URL: ${API_URL}`);
    console.log(`[Cron] Secret provided: ${MASKED_SECRET}`);

    if (!CRON_SECRET) {
        console.warn(`[Cron] ⚠️ WARNING: No CRON_SECRET provided. The API might reject the request.`);
    }

    const targetUrl = `${API_URL}/api/scan/cron/scan-all`;

    try {
        console.log(`[Cron] Sending POST request to: ${targetUrl}`);

        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-cron-secret': CRON_SECRET
            }
        });

        const contentType = response.headers.get('content-type') || '';
        let data;
        let rawText;

        try {
            rawText = await response.text();
            if (contentType.includes('application/json')) {
                data = JSON.parse(rawText);
            } else {
                data = { raw: rawText.substring(0, 500) }; // Preview first 500 chars of HTML/Text
            }
        } catch (e) {
            data = { error: 'Failed to parse response body' };
        }

        if (response.ok) {
            console.log(`[Cron] ✅ Success (${response.status}):`, JSON.stringify(data, null, 2));
        } else {
            console.error(`[Cron] ❌ Error (${response.status}):`, JSON.stringify(data, null, 2));
            if (!contentType.includes('application/json')) {
                console.error(`[Cron] Response Body Preview: ${rawText?.substring(0, 1000)}`);
            }
            process.exit(1);
        }
    } catch (error) {
        console.error(`[Cron] ❌ Network/Request failed:`, error.message);
        if (error.cause) console.error(`[Cron] Cause:`, error.cause);
        process.exit(1);
    }

    console.log(`[Cron] Completed at ${new Date().toISOString()}`);
    process.exit(0);
}

// Execute immediately
triggerAutoScan();
