import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { ingestListingMessage, replyFor } from '@/lib/listings/store'

export const dynamic = 'force-dynamic'

/**
 * A listing sent by an agent over WhatsApp.
 *
 * n8n receives the message (it owns the Twilio webhook) and forwards it here
 * rather than parsing it itself, so the parser exists in ONE place, in
 * TypeScript, with tests. Two copies of a parser that has already produced two
 * defects is how the fixed one and the broken one diverge (lesson 15).
 *
 * ⚠️ THIS IS A NEW INBOUND SURFACE ON THE COCKPIT, and it reuses the existing
 * n8n↔cockpit shared secret rather than introducing a new one, because the
 * operator holds all secrets and a new one is operator work. That is a
 * deliberate trade and it is worth knowing: a leak of that secret would now
 * expose two directions rather than one. Recorded in the runbook.
 */

function authed(req: Request): boolean {
  const want = process.env.N8N_SEND_SECRET ?? ''
  const given = req.headers.get('x-ryvo-cockpit-secret') ?? ''
  if (!want || given.length !== want.length) return false
  return timingSafeEqual(Buffer.from(given), Buffer.from(want))
}

export async function POST(req: Request) {
  if (!authed(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorised' }, { status: 401 })
  }

  let body: { clientId?: string; from?: string; text?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'body is not JSON' }, { status: 400 })
  }

  const clientId = String(body.clientId ?? '')
  const from = String(body.from ?? '')
  const text = String(body.text ?? '')
  if (!clientId || !text) {
    return NextResponse.json({ ok: false, error: 'clientId and text are required' }, { status: 422 })
  }

  try {
    const outcome = await ingestListingMessage({ clientId, from, text })
    // The reply is always returned, including for the outcomes where nothing
    // was stored. An agent who sends a listing and hears nothing assumes it
    // landed, and a listing that was never created is invisible until a match
    // does not happen.
    return NextResponse.json({ ok: true, kind: outcome.kind, reply: replyFor(outcome) })
  } catch (e) {
    // Loud, and with the provider's own message. n8n asserts this response
    // downstream rather than trusting a 2xx (lesson #13).
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
