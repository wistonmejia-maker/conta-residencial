/**
 * Cron Scan API Route
 * GET /api/cron/scan - Vercel Cron endpoint for auto-scanning Gmail
 * 
 * Scheduled via vercel.json cron configuration.
 * Scans all units with Gmail connected and creates tickets for new emails.
 * 
 * Protected by CRON_SECRET header validation.
 */

import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Kill-switch
  if (process.env.DISABLE_AUTO_SCAN === 'true') {
    return NextResponse.json({ success: true, message: 'Auto-scan disabled', scanned: 0 })
  }

  // TODO: Scan all units with Gmail connected
  return NextResponse.json({ success: true, scanned: 0 })
}
