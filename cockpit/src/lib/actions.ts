'use server'

import { revalidatePath } from 'next/cache'
import { requireOperator } from '@/lib/auth'
import { admin } from '@/lib/supabase/admin'
import { parseEscalated } from '@/lib/escalation'

export type ActionResult = { ok: boolean; message: string }

/**
 * Send a reply to a lead.
 *
 * The cockpit does NOT call Twilio. It calls one n8n webhook, which sends
 * through the existing path — §6, the document's most important
 * architectural constraint. A second send path would need its own signature
 * handling, its own messages row, its own external_id and its own dedupe,
 * and would drift from the first. Phase 1 spent a checkpoint discovering
 * that the outbound row must carry Twilio's sid as external_id; one path
 * means one set of rules.
 *
 * Only the lead id and the text cross the wire. The destination number is
 * resolved by n8n from the lead row, so holding the secret does not let you
 * send a WhatsApp message to an arbitrary number on the client's account.
 */
export async function sendReply(leadId: string, text: string): Promise<ActionResult> {
  await requireOperator()

  const body = text.trim()
  if (!body) return { ok: false, message: 'Nothing to send.' }
  if (body.length > 1500) return { ok: false, message: 'Too long — 1500 characters maximum.' }

  const url = process.env.N8N_SEND_URL
  const secret = process.env.N8N_SEND_SECRET
  if (!url || !secret) {
    return { ok: false, message: 'Sending is not configured: N8N_SEND_URL or N8N_SEND_SECRET is missing.' }
  }

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ryvo-cockpit-secret': secret },
      body: JSON.stringify({ leadId, text: body }),
      cache: 'no-store',
      signal: AbortSignal.timeout(25_000),
    })
  } catch (e) {
    // A transport failure is NOT a send. n8n's neverError covers non-2xx
    // responses and nothing else — DNS, refused connections and timeouts
    // still throw, and ours was DNS once already (rule 9).
    return {
      ok: false,
      message: `Not sent — could not reach the send webhook (${e instanceof Error ? e.message : 'unknown'}).`,
    }
  }

  let payload: Record<string, unknown> = {}
  try {
    payload = (await res.json()) as Record<string, unknown>
  } catch {
    return { ok: false, message: `Not sent — the webhook returned ${res.status} with no readable body.` }
  }

  if (res.status === 401) return { ok: false, message: 'Not sent — the shared secret was rejected.' }
  if (!res.ok || payload.ok !== true) {
    // The one thing this screen must never do is say a message was sent when
    // it was not. That is instance 6, and it is the only one that reached a
    // prospect. So every non-success is reported as a failure, in words.
    const err = String(payload.error ?? `http_${res.status}`)
    const detail = payload.errorMessage ? ` (${String(payload.errorMessage)})` : ''

    if (err === 'message_not_recorded') {
      return {
        ok: false,
        message:
          'The lead received the message, but it was NOT recorded in the ' +
          'conversation. Do not resend — check the messages table before doing anything else.',
      }
    }
    return { ok: false, message: `Not sent — ${err}${detail}.` }
  }

  revalidatePath(`/leads/${leadId}`)
  revalidatePath('/queue')
  return { ok: true, message: 'Sent, and recorded in the conversation.' }
}

/**
 * Hand the lead back to the AI.
 *
 * Never automatic (§5.3): a lead escalated for a reason, and an assistant
 * silently resuming mid-conversation is how it ends up negotiating a price
 * you were about to discuss. The default is that the lead stays with the
 * human; this is an explicit, confirmed action.
 *
 * The escalation is cleared by DELETING the key, never by setting it to
 * null. `{"escalated": null}` is the exact value that survives a
 * `->>escalated IS NOT NULL` filter, and this is the code path most likely
 * to write it — see §7 of engineering-lessons.md. The audit trail lives in
 * `events` instead, which is append-only and where the rest of the history
 * already is.
 */
export async function handBackToAI(leadId: string): Promise<ActionResult> {
  const operator = await requireOperator()
  const db = admin()

  const { data: lead, error: readErr } = await db
    .from('leads')
    .select('id, client_id, qualification')
    .eq('id', leadId)
    .maybeSingle()

  if (readErr) return { ok: false, message: `Could not read the lead: ${readErr.message}` }
  if (!lead) return { ok: false, message: 'That lead no longer exists.' }

  const before = parseEscalated(lead.qualification)
  if (!before) return { ok: false, message: 'That lead is not escalated.' }

  const q = { ...((lead.qualification as Record<string, unknown>) ?? {}) }
  delete q.escalated

  const { error: writeErr } = await db
    .from('leads')
    .update({ qualification: q, updated_at: new Date().toISOString() })
    .eq('id', leadId)

  if (writeErr) return { ok: false, message: `Could not clear the escalation: ${writeErr.message}` }

  // Read the row back rather than trusting the update's status. Rule 14:
  // a green write is not evidence the row changed — go and look.
  const { data: after } = await db
    .from('leads')
    .select('qualification')
    .eq('id', leadId)
    .maybeSingle()

  if (after && parseEscalated(after.qualification)) {
    return { ok: false, message: 'The escalation is still set after the update. Nothing was handed back.' }
  }

  const { error: eventErr } = await db.from('events').insert({
    client_id: lead.client_id,
    type: 'lead.escalation_cleared',
    severity: 'info',
    summary: `Escalation cleared by ${operator.email}`,
    data: {
      lead_id: leadId,
      cleared_by: operator.email,
      cleared_at: new Date().toISOString(),
      // What it was, so the trail survives the key being deleted.
      previous_reasons: before.reasons,
      escalated_at: before.at,
      source: 'cockpit',
    },
  })

  revalidatePath(`/leads/${leadId}`)
  revalidatePath('/queue')

  if (eventErr) {
    return {
      ok: true,
      message: `Handed back to the AI — but the audit event failed to write (${eventErr.message}).`,
    }
  }
  return { ok: true, message: 'Handed back. The AI will answer the next message.' }
}
