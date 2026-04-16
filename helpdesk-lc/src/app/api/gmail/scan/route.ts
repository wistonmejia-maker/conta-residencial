/**
 * Gmail Scan API Route
 * POST /api/gmail/scan - Scan Gmail inbox for new helpdesk emails
 * 
 * Query: ?unitId=<uuid>
 * Scans for text emails (not invoices/attachments) and creates tickets.
 * Each email is classified by Gemini AI for category, priority, and sentiment.
 */

import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  // TODO: Scan Gmail for helpdesk emails and create tickets
  return NextResponse.json({ success: true, ticketsCreated: 0 })
}
