/**
 * Gmail OAuth Callback Route
 * GET /api/gmail/callback - Handles Google OAuth callback after user authorizes Gmail
 * 
 * Receives authorization code, exchanges for tokens, and stores in DB.
 * Reuses existing Google Cloud credentials from ContaResidencial project.
 */

import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  // TODO: Exchange auth code for tokens and store in gmail_tokens table
  return NextResponse.redirect(new URL('/settings/gmail', request.url))
}
