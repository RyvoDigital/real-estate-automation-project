import 'server-only'

import { admin } from '@/lib/supabase/admin'
import { classifyStaleness, type RefusedSend, type Staleness, type WorldNow } from '@/lib/contact/staleness'

/*
 * ═════════════════════════════════════════════════════════════════════════════
 * EVERYTHING WE HOLD ABOUT ONE PERSON, FOR ONE CLIENT.
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Brief II §1.9. Q13 and 🔴 Q14 — *why did this person not get the message?*
 *
 * 🔒 SCOPED TO `(client_id, phone_e164)`, NEVER TO A LEAD ROW. The durable
 * identity beneath a client is the number. `consent_events` is keyed on it and
 * calls `lead_id` "a convenience link only"; `sends.lead_id` and
 * `messages.lead_id` are both `on delete set null`; the importer dedupes on the
 * number. A lead-scoped read shows a person's history with the part that
 * matters most missing — and misses it exactly where it matters, for a contact
 * whose lead row was reverted by an import undo or removed under the erasure
 * path, who still has a ledger and may still be objected.
 *
 * 🔴 EVERY PANEL IS READ AND CAUGHT ON ITS OWN. §1.6 S3: a blank ledger panel
 * and a ledger with nothing in it are OPPOSITE CLAIMS about whether this person
 * may be messaged. One failed read must degrade one panel and never become a
 * confident absence in another — so each field below is `T[] | null`, and null
 * is always "we could not look".
 */

/** 🔒 Null is never an empty list. It is "the read failed". */
export type PanelOrUnknown<T> = T[] | null

export type LedgerEvent = {
  id: string
  kind: string
  /** 🔒 When it happened in the world. Null is legitimate — "time of act unknown". */
  occurredAt: string | null
  /** 🔒 When WE wrote it down. Never the same column as occurredAt (lesson 10). */
  recordedAt: string
  source: string
  segment: string | null
  /** Null means NOT RETAINED, never a guess at what was said. */
  wording: string | null
  declaredBy: string | null
  note: string | null
}

export type SendRow = {
  id: string
  status: string
  verdict: string
  layer: string | null
  reason: string | null
  /** The operator sentence. The refusal reasons already carry operator wording. */
  detail: string | null
  basis: string | null
  obligations: unknown
  decidedAt: string
  intentRecordedAt: string
  country: string | null
  segment: string | null
  automation: string
  templateName: string | null
  bodyIntended: string | null
  /** 🔒 From the wire, not from a flag. */
  bodySent: string | null
  sentAt: string | null
  failedAt: string | null
  error: string | null
  attempts: number
  reconciledAt: string | null
  /** §1.4.1, computed per row. */
  staleness: Staleness
}

export type MessageRow = {
  id: string
  direction: string
  body: string | null
  origin: string | null
  attributionState: string | null
  createdAt: string
  /** 🔒 Null is the audit trail working, not an orphan (§1.3). */
  leadId: string | null
}

export type LeadRow = { id: string; name: string | null; stage: string | null; createdAt: string }

export type ContactRecord = {
  e164: string
  /** 🔒 A contact with no name renders as the number, never as "Unknown". */
  name: string | null
  /** True when nothing at all is known about this number for this client (S2). */
  unknown: boolean
  ledger: PanelOrUnknown<LedgerEvent>
  sends: PanelOrUnknown<SendRow>
  messages: PanelOrUnknown<MessageRow>
  leads: PanelOrUnknown<LeadRow>
  /** How many messages exist beyond the cap, for S6. */
  messagesCapped: boolean
  /** 🔴 A reserved test number is a fixture, not a person (§1.6). */
  reserved: boolean
  at: string
}

const MESSAGE_CAP = 200

/** `+351900000xxx` — the gate's first layer refuses these and a CHECK forbids sending. */
function isReserved(e164: string): boolean {
  return /^\+351900000\d{3}$/.test(e164)
}

/**
 * What the world says now, for §1.4.1.
 *
 * 🔒 `checked` is false when ANY of these reads failed. A partial world would
 * let a refusal render as current on the strength of a policy table we could
 * not read — the not-checked wearing a nothing-changed sentence that §0.4-10 is
 * about, on the screen that answers an Article 15 request.
 */
async function readWorld(clientId: string, e164: string): Promise<WorldNow> {
  try {
    const db = admin()
    const [advertising, jurisdiction, consent] = await Promise.all([
      db.from('advertising_policy').select('country, confirmed_at'),
      db.from('jurisdiction_policy').select('country, confirmed_at'),
      db
        .from('consent_events')
        .select('recorded_at')
        .eq('client_id', clientId)
        .eq('phone_e164', e164)
        .order('recorded_at', { ascending: false })
        .limit(1),
    ])
    if (advertising.error || jurisdiction.error || consent.error) throw new Error('world read failed')

    // Newest confirmation across countries; the per-row country narrows it at
    // classify time. Kept deliberately simple: a country a row names but the
    // table has no row for yields null, which reads as "not newer".
    const newest = (rows: { confirmed_at: string | null }[] | null) =>
      (rows ?? [])
        .map((r) => r.confirmed_at)
        .filter((v): v is string => Boolean(v))
        .sort()
        .at(-1) ?? null

    return {
      checked: true,
      advertisingConfirmedAt: newest(advertising.data),
      jurisdictionConfirmedAt: newest(jurisdiction.data),
      latestConsentAt: consent.data?.[0]?.recorded_at ?? null,
    }
  } catch {
    return { checked: false }
  }
}

export async function readContact(clientId: string, e164: string): Promise<ContactRecord> {
  const db = admin()
  const at = new Date().toISOString()

  const settle = async <T>(run: () => Promise<T[]>): Promise<T[] | null> => {
    try {
      return await run()
    } catch {
      return null
    }
  }

  const world = await readWorld(clientId, e164)

  const [ledger, sends, leads] = await Promise.all([
    settle(async () => {
      const { data, error } = await db
        .from('consent_events')
        .select('id, kind, occurred_at, recorded_at, source, segment, wording, declared_by, note')
        .eq('client_id', clientId)
        .eq('phone_e164', e164)
        .order('recorded_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map((e) => ({
        id: e.id,
        kind: e.kind,
        occurredAt: e.occurred_at,
        recordedAt: e.recorded_at,
        source: e.source,
        segment: e.segment,
        wording: e.wording,
        declaredBy: e.declared_by,
        note: e.note,
      }))
    }),

    settle(async () => {
      const { data, error } = await db
        .from('sends')
        // 🔒 ONE STRING LITERAL, not a concatenation. Supabase types the result
        // by PARSING this literal, so a joined expression gives every column
        // the type `GenericStringError` and the whole row goes untyped — which
        // compiles right up until a column is renamed.
        .select('id, status, gate_verdict, gate_layer, gate_reason, gate_detail, gate_basis, gate_obligations, gate_decided_at, intent_recorded_at, country, segment, automation, template_name, body_intended, body_sent, sent_at, failed_at, error, attempts, reconciled_at')
        .eq('client_id', clientId)
        .eq('phone_e164', e164)
        .order('intent_recorded_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map((s) => {
        const refusal: RefusedSend = {
          decidedAt: s.gate_decided_at,
          layer: s.gate_layer,
          reason: s.gate_reason,
          country: s.country,
        }
        return {
          id: s.id,
          status: s.status,
          verdict: s.gate_verdict,
          layer: s.gate_layer,
          reason: s.gate_reason,
          detail: s.gate_detail,
          basis: s.gate_basis,
          obligations: s.gate_obligations,
          decidedAt: s.gate_decided_at,
          intentRecordedAt: s.intent_recorded_at,
          country: s.country,
          segment: s.segment,
          automation: s.automation,
          templateName: s.template_name,
          bodyIntended: s.body_intended,
          bodySent: s.body_sent,
          sentAt: s.sent_at,
          failedAt: s.failed_at,
          error: s.error,
          attempts: s.attempts ?? 0,
          reconciledAt: s.reconciled_at,
          // 🔒 Only a refusal can be stale. A `sent` row records something that
          // actually happened, and no later confirmation makes it un-happen.
          staleness:
            s.gate_verdict === 'refused'
              ? classifyStaleness(refusal, world)
              : ({ state: 'current' } as Staleness),
        }
      })
    }),

    settle(async () => {
      const { data, error } = await db
        .from('leads')
        .select('id, name, stage, created_at')
        .eq('client_id', clientId)
        .eq('phone', e164)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map((l) => ({ id: l.id, name: l.name, stage: l.stage, createdAt: l.created_at }))
    }),
  ])

  /*
   * Messages hang off lead ids, and 🔒 a message whose `lead_id` is now null
   * still belongs here — that is `on delete set null` doing its job. They are
   * reachable only through the lead ids we know about, so a message orphaned
   * before we ever saw its lead cannot be found; the page says so rather than
   * implying the list is complete.
   */
  const leadIds = (leads ?? []).map((l) => l.id)
  const messages = await settle(async () => {
    if (leadIds.length === 0) return []
    const { data, error } = await db
      .from('messages')
      .select('id, direction, body, origin, attribution_state, created_at, lead_id')
      .in('lead_id', leadIds)
      .order('created_at', { ascending: false })
      .limit(MESSAGE_CAP)
    if (error) throw error
    return (data ?? []).map((m) => ({
      id: m.id,
      direction: m.direction,
      body: m.body,
      origin: m.origin,
      attributionState: m.attribution_state,
      createdAt: m.created_at,
      leadId: m.lead_id,
    }))
  })

  const name = (leads ?? []).map((l) => l.name).find((n) => Boolean(n)) ?? null

  /*
   * 🔴 S2 — the number is not known to this client AT ALL. Distinct from S1, a
   * contact with a ledger and no messages, which is normal after an import.
   *
   * It requires every panel to have READ successfully and returned nothing. A
   * null anywhere means we cannot make this claim: "we have never heard of
   * them" on the strength of a query that threw is the worst sentence this
   * screen could produce, because it is the Article 15 answer.
   */
  const unknown =
    ledger !== null &&
    sends !== null &&
    leads !== null &&
    ledger.length === 0 &&
    sends.length === 0 &&
    leads.length === 0

  return {
    e164,
    name,
    unknown,
    ledger,
    sends,
    messages,
    leads,
    messagesCapped: (messages?.length ?? 0) >= MESSAGE_CAP,
    reserved: isReserved(e164),
    at,
  }
}
