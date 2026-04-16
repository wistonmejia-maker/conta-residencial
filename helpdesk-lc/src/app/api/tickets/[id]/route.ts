/**
 * Ticket Detail API Route
 * GET    /api/tickets/[id] - Get ticket detail with messages
 * PUT    /api/tickets/[id] - Update ticket (status, priority, assignedTo)
 * DELETE /api/tickets/[id] - Close/delete ticket
 */

import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  // TODO: Fetch ticket with messages from DB
  return NextResponse.json({ ticket: null, id })
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  // TODO: Update ticket fields
  return NextResponse.json({ success: true, id })
}
