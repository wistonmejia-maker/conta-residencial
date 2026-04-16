/**
 * Ticket Reply API Route
 * POST /api/tickets/[id]/reply - Send reply to property owner via Gmail
 * 
 * Body: { body: string, isInternalNote?: boolean }
 * - If isInternalNote is true, saves as NOTE (not sent via email)
 * - If false, sends email reply via Gmail and saves as OUTBOUND message
 */

import { NextResponse } from 'next/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  // TODO: Send reply via Gmail API and save as TicketMessage
  return NextResponse.json({ success: true, ticketId: id })
}
