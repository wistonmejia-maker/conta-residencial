/**
 * AI Classification API Route
 * POST /api/ai/classify - Classify a ticket using Gemini AI
 * 
 * Body: { subject: string, body: string, unitName: string }
 * Returns: { category, priority, sentiment, summary, suggestedReply }
 */

import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  // TODO: Call Gemini to classify ticket
  return NextResponse.json({
    category: 'OTRO',
    priority: 'MEDIUM',
    sentiment: 'NEUTRAL',
    summary: '',
    suggestedReply: ''
  })
}
