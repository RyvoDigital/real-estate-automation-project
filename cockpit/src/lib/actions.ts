'use server'

import { createClientCore, type CreateResult } from '@/lib/onboarding-create'
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
export async function sendReply(
  leadId: string,
  text: string,
  handBack = false,
): Promise<ActionResult> {
  const operator = await requireOperator()

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

  // Hand-back rides on a CONFIRMED send only — a failed send returned above
  // and cleared nothing. The flag is opt-in per message (decision recorded in
  // the Phase 2 handoff §5.3): a ticked-and-forgotten default would resume
  // the AI underneath a human mid-negotiation, which is the failure §5.3
  // exists to prevent; an unticked-and-forgotten one leaves the AI quiet,
  // which is visible on the queue and recoverable from the button beside
  // this composer.
  if (!handBack) return { ok: true, message: 'Sent, and recorded in the conversation.' }

  const cleared = await clearEscalation(leadId, operator.email, 'cockpit_reply')
  if (cleared.ok === 'not_escalated') {
    return { ok: true, message: 'Sent, and recorded in the conversation. The lead was not escalated, so there was nothing to hand back.' }
  }
  if (cleared.ok !== true) {
    // The message DID go. Saying "not sent" here would be instance 6 in
    // reverse, so the two outcomes are stated separately.
    return {
      ok: false,
      message: `Sent and recorded — but the lead was NOT handed back: ${cleared.message} The AI is still silent on this lead.`,
    }
  }
  return {
    ok: true,
    message: cleared.eventFailed
      ? 'Sent, and handed back to the AI — but the audit event failed to write.'
      : 'Sent, and handed back. The AI will answer the next message.',
  }
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
  const r = await clearEscalation(leadId, operator.email, 'cockpit')
  if (r.ok === 'not_escalated') return { ok: false, message: 'That lead is not escalated.' }
  if (r.ok !== true) return { ok: false, message: r.message }
  if (r.eventFailed) {
    return { ok: true, message: `Handed back to the AI — but the audit event failed to write (${r.message}).` }
  }
  return { ok: true, message: 'Handed back. The AI will answer the next message.' }
}

type ClearResult =
  | { ok: true; eventFailed: boolean; message: string }
  | { ok: 'not_escalated' }
  | { ok: false; message: string }

/**
 * The one place the escalation key is removed. Both callers — the explicit
 * button and the opt-in on send — go through here so there is exactly one
 * set of rules: delete the key (never null it), read the row back before
 * believing it, and leave the trail in `events` with the source named.
 */
async function clearEscalation(
  leadId: string,
  operatorEmail: string,
  source: 'cockpit' | 'cockpit_reply',
): Promise<ClearResult> {
  const db = admin()

  const { data: lead, error: readErr } = await db
    .from('leads')
    .select('id, client_id, qualification')
    .eq('id', leadId)
    .maybeSingle()

  if (readErr) return { ok: false, message: `Could not read the lead: ${readErr.message}` }
  if (!lead) return { ok: false, message: 'That lead no longer exists.' }

  const before = parseEscalated(lead.qualification)
  if (!before) return { ok: 'not_escalated' }

  const q = { ...((lead.qualification as Record<string, unknown>) ?? {}) }
  delete q.escalated
  // The hand-back is also stated ON THE LEAD, because the Concierge reads the
  // lead row on every message and the events table on none. BuildClaudeRequest
  // turns this into a note in the transcript at the point it happened, so
  // "a colleague already handled that" is a fact the model is told rather than
  // something it has to infer from an unlabelled handoff note.
  const clearedAt = new Date().toISOString()
  q.escalation_cleared_at = clearedAt
  q.escalation_cleared_by = operatorEmail

  const { error: writeErr } = await db
    .from('leads')
    .update({ qualification: q, updated_at: clearedAt })
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
    summary: `Escalation cleared by ${operatorEmail}`,
    data: {
      lead_id: leadId,
      cleared_by: operatorEmail,
      cleared_at: clearedAt,
      // What it was, so the trail survives the key being deleted.
      previous_reasons: before.reasons,
      escalated_at: before.at,
      source,
    },
  })

  revalidatePath(`/leads/${leadId}`)
  revalidatePath('/queue')

  return { ok: true, eventFailed: Boolean(eventErr), message: eventErr?.message ?? '' }
}

// ------------------------------------------------------------- onboarding

import { type ClientDraft } from '@/lib/onboarding'

export type CalendarProbe = { ok: boolean; error: string | null; busyCount: number | null }

/**
 * Ask n8n to probe the calendar with free/busy.
 *
 * The cockpit has no Google credential and must not grow one: the OAuth
 * credential lives in n8n, encrypted at rest, and a second integration would
 * be a second thing to rotate and a second thing to drift. Same reasoning as
 * §6's one send path.
 *
 * What is being checked is not "did Google answer". Google returns HTTP 200
 * with an empty busy list for a calendar it cannot read, so a wrong id is
 * byte-identical to a completely free one — and a Concierge trusting that
 * would offer every slot in the window. n8n applies the real rule: 2xx, the
 * calendar key present, and no errors array.
 */
export async function validateCalendar(
  calendarId: string,
  timezone: string,
): Promise<CalendarProbe> {
  await requireOperator()

  const base = process.env.N8N_SEND_URL
  const secret = process.env.N8N_SEND_SECRET
  if (!base || !secret) {
    return { ok: false, error: 'validation_not_configured', busyCount: null }
  }
  const url = base.replace(/\/cockpit-send$/, '/cockpit-validate')

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ryvo-cockpit-secret': secret },
      body: JSON.stringify({ calendarId, timezone }),
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    })
    if (res.status === 401) return { ok: false, error: 'unauthorised', busyCount: null }
    const p = (await res.json()) as CalendarProbe
    return { ok: p.ok === true, error: p.error ?? null, busyCount: p.busyCount ?? null }
  } catch (e) {
    return {
      ok: false,
      error: `unreachable:${e instanceof Error ? e.message : 'unknown'}`,
      busyCount: null,
    }
  }
}

export type { CreateResult } from '@/lib/onboarding-create'

/**
 * Create the client and its automation config: the thin server action.
 *
 * The WRITE PATH is lib/onboarding-create.ts (createClientCore), with every
 * dependency injected and every path tested with fakes
 * (tests/onboarding-create.test.ts). This wrapper only supplies the real ones:
 * the operator check, the calendar probe, the service-role database, and the
 * revalidation. Nothing is decided here.
 *
 * The calendar is re-probed server-side at save. The form probes too, for
 * feedback, but a value can change between the probe and the submit and the
 * browser's word for it is not evidence.
 */
export async function createClient(draft: ClientDraft): Promise<CreateResult> {
  await requireOperator()
  const db = admin()
  return createClientCore(draft, {
    probeCalendar: (id, tz) => validateCalendar(id, tz),
    async findClientByNumber(wa) {
      const { data, error } = await db.from('clients').select('id, name').eq('whatsapp_number', wa).maybeSingle()
      if (error) throw new Error(`the duplicate-number check could not read clients: ${error.message}`)
      return data ? { id: data.id as string, name: data.name as string } : null
    },
    async insertClient(row) {
      const { data, error } = await db.from('clients').insert(row).select('id').single()
      return { id: (data?.id as string | undefined) ?? null, error: error ? { code: error.code, message: error.message } : null }
    },
    async findAutomationId(key) {
      const { data } = await db.from('automations').select('id').eq('key', key).maybeSingle()
      return (data?.id as string | undefined) ?? null
    },
    async insertConfig(row) {
      // `health` is NOT written: 0036 drops the column, and the per-client health
      // rollup is derived from automation_runs and the anomaly events instead.
      const { error } = await db.from('client_automations').insert(row)
      return { error: error ? { code: error.code, message: error.message } : null }
    },
    async readConfig(clientId) {
      const { data } = await db.from('client_automations').select('config').eq('client_id', clientId).maybeSingle()
      return data ? { config: data.config } : null
    },
    async deleteClient(clientId) {
      const { error } = await db.from('clients').delete().eq('id', clientId)
      return { error: error ? { code: error.code, message: error.message } : null }
    },
    async clientExists(clientId) {
      const { data } = await db.from('clients').select('id').eq('id', clientId).maybeSingle()
      return Boolean(data)
    },
    async insertEvent(row) {
      const { error } = await db.from('events').insert(row)
      return { error: error ? { code: error.code, message: error.message } : null }
    },
    revalidate: (path) => revalidatePath(path),
  })
}

// -------------------------------------------------------- draft assistant

import { fixedReply, guardDraft, mustUseFixedReply, type DraftSource } from '@/lib/draft'

export type DraftResult = {
  ok: boolean
  draft: string
  source: DraftSource
  language: string
  /** Why the model was bypassed, or why its draft was thrown away. Shown to
   *  the operator: a suppressed draft that says nothing about being
   *  suppressed is indistinguishable from a model that happened to write
   *  something cautious. */
  note: string | null
  message: string
}

/**
 * Draft a reply. NEVER sends (§7).
 *
 * Three layers, and only the first two are controls:
 *
 *   1. For a price or high-value escalation the model is NOT CALLED. §7 names
 *      that as the most likely draft request and exactly where a drafted
 *      negotiating position does the most damage; the strongest form of
 *      "never negotiate" is never giving it the chance.
 *   2. Whatever comes back is put through guardDraft(), which is deterministic
 *      and unit-tested. A draft that names a time or invents a figure is
 *      DISCARDED, not edited — trimming a sentence leaves a plausible
 *      remainder, and a plausible remainder is what nobody re-reads.
 *   3. The prompt asks for the same things. That is the layer that will
 *      eventually fail, which is why it is last.
 *
 * A discarded draft falls back to the client's own handoff note — the same
 * human-written string the Concierge sends when it fails, so there is no
 * second set of copy to drift.
 */
export async function draftReply(leadId: string): Promise<DraftResult> {
  await requireOperator()

  const base = process.env.N8N_SEND_URL
  const secret = process.env.N8N_SEND_SECRET
  const fail = (message: string): DraftResult => ({
    ok: false, draft: '', source: 'fixed', language: 'pt', note: null, message,
  })

  if (!base || !secret) return fail('Drafting is not configured.')
  const url = base.replace(/\/cockpit-send$/, '/cockpit-draft')

  let payload: {
    ok?: boolean; draft?: string; error?: string | null; language?: string
    fallbackLanguage?: string; reasons?: string[]; handoff?: Record<string, string>
    transcript?: string; modelOk?: boolean
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ryvo-cockpit-secret': secret },
      body: JSON.stringify({ leadId }),
      cache: 'no-store',
      signal: AbortSignal.timeout(35_000),
    })
    if (res.status === 401) return fail('The shared secret was rejected.')
    payload = await res.json()
  } catch (e) {
    return fail(`Could not reach the draft endpoint (${e instanceof Error ? e.message : 'unknown'}).`)
  }

  const language = payload.language ?? 'pt'
  const fallbackLanguage = payload.fallbackLanguage ?? 'pt'
  const reasons = payload.reasons ?? []
  const transcript = payload.transcript ?? ''
  const note = fixedReply(payload.handoff, language, fallbackLanguage)

  const useFixed = (why: string): DraftResult =>
    note
      ? {
          ok: true, draft: note, source: 'fixed', language, note: why,
          message: 'Drafted from the client’s own handoff note.',
        }
      : fail(`${why} — and this client has no handoff note for ${language} to fall back on.`)

  // 1. The model is not asked at all.
  const bypass = mustUseFixedReply(reasons, transcript)
  if (bypass.fixed) return useFixed(`The assistant was not asked to write this: ${bypass.why}.`)

  if (!payload.modelOk || !payload.draft) {
    return useFixed('The model call failed, so nothing was drafted')
  }

  // 2. The deterministic guard decides whether what came back may be shown.
  const verdict = guardDraft(payload.draft, transcript)
  if (!verdict.ok) {
    return useFixed(`The suggestion was discarded because ${verdict.detail}`)
  }

  return {
    ok: true, draft: payload.draft.trim(), source: 'model', language, note: null,
    message: 'Drafted. Read every word before sending — nothing has been sent.',
  }
}
