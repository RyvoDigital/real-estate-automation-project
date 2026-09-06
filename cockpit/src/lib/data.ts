import 'server-only'

import { admin } from '@/lib/supabase/admin'
import {
  classify,
  minutesSince,
  parseEscalated,
  tierFor,
  type EscalationClass,
  type Tier,
} from '@/lib/escalation'

export type QueueRow = {
  id: string
  name: string
  phone: string | null
  clientName: string
  at: string | null
  minutes: number
  tier: Tier
  reasons: string[]
  primary: EscalationClass
  classes: EscalationClass[]
  lastMessage: string | null
}

type LeadRow = {
  id: string
  full_name: string | null
  phone: string | null
  client_id: string
  qualification: unknown
  budget_min: number | null
  budget_max: number | null
  timeline: string | null
  area: string | null
  stage: string | null
  lead_type: string | null
  last_contact_at: string | null
}

/**
 * Every lead currently waiting on a human, across all clients.
 *
 * Sorted LONGEST WAITING FIRST. The spec once said newest-first and also
 * called a four-hour-old lead the failure state this screen prevents;
 * those contradict, and newest-first pushes exactly that lead off the
 * bottom. §5.1.
 *
 * The filter uses `->>` and not `->`, and the difference is load-bearing.
 * `qualification->escalated` yields jsonb, and a stored JSON null is not SQL
 * NULL, so `{"escalated": null}` SURVIVES `IS NOT NULL` — measured against
 * the real database in tests/probe-filter-excludes.ts, not assumed. `->>`
 * yields text, and the text of a jsonb null IS SQL NULL, so both the
 * missing key and the explicit null are excluded.
 *
 * This matters at E2: clearing an escalation by writing `escalated: null` is
 * the obvious way to implement §5.3's hand-back, and with `->` that lead
 * would be fetched for ever. The parser would still drop it from the render,
 * so the screen would look right while the query quietly did the wrong
 * thing — which is the failure mode this project keeps meeting.
 *
 * Ordering is done here rather than in the query because the sort key is
 * `qualification->escalated->>at`, a text field: it sorts lexicographically
 * in Postgres, and a row with a missing or malformed `at` would sort to an
 * arbitrary place rather than an obvious one. Escalated leads are few by
 * definition — if that ever stops being true, the fix is an indexed
 * `escalated_at` column, not a cleverer string sort.
 */
export async function getQueue(limit = 100): Promise<QueueRow[]> {
  const db = admin()

  const { data: leads, error } = await db
    .from('leads')
    .select(
      'id, full_name, phone, client_id, qualification, budget_min, budget_max, timeline, area, stage, lead_type, last_contact_at',
    )
    .not('qualification->>escalated', 'is', null)
    .limit(limit)

  if (error) throw new Error(`leads query failed: ${error.message}`)
  if (!leads || leads.length === 0) return []

  const rows = leads as LeadRow[]
  const clientNames = await getClientNames(rows.map((l) => l.client_id))
  const lastMessages = await getLastInboundMessages(rows.map((l) => l.id))
  const now = Date.now()

  const out: QueueRow[] = []
  for (const lead of rows) {
    const esc = parseEscalated(lead.qualification)
    // `.not(... is null)` already filters these out; this is the belt for
    // the braces, and it keeps the type honest.
    if (!esc) continue

    const minutes = minutesSince(esc.at, now)
    const { primary, classes } = classify(esc.reasons)

    out.push({
      id: lead.id,
      name: lead.full_name ?? 'Unknown lead',
      phone: lead.phone,
      clientName: clientNames.get(lead.client_id) ?? 'Unknown client',
      at: esc.at,
      minutes,
      tier: tierFor(minutes),
      reasons: esc.reasons,
      primary,
      classes,
      lastMessage: lastMessages.get(lead.id) ?? null,
    })
  }

  // Longest waiting first. A null `at` has no wait we can trust, so it goes
  // last rather than pretending to be zero minutes old and jumping the queue.
  out.sort((a, b) => {
    if (a.at === null && b.at === null) return 0
    if (a.at === null) return 1
    if (b.at === null) return -1
    return b.minutes - a.minutes
  })

  return out
}

async function getClientNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map()

  const { data, error } = await admin().from('clients').select('id, name').in('id', unique)
  if (error) throw new Error(`clients query failed: ${error.message}`)

  return new Map((data ?? []).map((c) => [c.id as string, c.name as string]))
}

async function getLastInboundMessages(leadIds: string[]): Promise<Map<string, string>> {
  if (leadIds.length === 0) return new Map()

  const { data, error } = await admin()
    .from('messages')
    .select('lead_id, body, created_at')
    .in('lead_id', leadIds)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(leadIds.length * 12)

  if (error) throw new Error(`messages query failed: ${error.message}`)

  const map = new Map<string, string>()
  for (const m of data ?? []) {
    const id = m.lead_id as string
    if (!map.has(id) && m.body) map.set(id, m.body as string)
  }
  return map
}

export type Message = {
  id: string
  direction: 'inbound' | 'outbound'
  body: string | null
  status: string | null
  aiGenerated: boolean
  createdAt: string
}

export type LeadDetail = {
  id: string
  name: string
  phone: string | null
  clientName: string
  stage: string | null
  leadType: string | null
  budgetMin: number | null
  budgetMax: number | null
  timeline: string | null
  area: string | null
  qualification: Record<string, unknown>
  escalated: { at: string | null; reasons: string[] } | null
  minutes: number
  tier: Tier
  primary: EscalationClass
  classes: EscalationClass[]
  messages: Message[]
  viewing: { startsAt: string | null; summary: string | null } | null
}

export async function getLead(id: string): Promise<LeadDetail | null> {
  const db = admin()

  const { data, error } = await db
    .from('leads')
    .select(
      'id, full_name, phone, client_id, qualification, budget_min, budget_max, timeline, area, stage, lead_type',
    )
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`lead query failed: ${error.message}`)
  if (!data) return null

  const lead = data as LeadRow
  const [names, messages, viewing] = await Promise.all([
    getClientNames([lead.client_id]),
    getMessages(lead.id),
    getViewing(lead.id),
  ])

  const esc = parseEscalated(lead.qualification)
  const minutes = esc ? minutesSince(esc.at) : 0
  const { primary, classes } = classify(esc?.reasons ?? [])

  return {
    id: lead.id,
    name: lead.full_name ?? 'Unknown lead',
    phone: lead.phone,
    clientName: names.get(lead.client_id) ?? 'Unknown client',
    stage: lead.stage,
    leadType: lead.lead_type,
    budgetMin: lead.budget_min,
    budgetMax: lead.budget_max,
    timeline: lead.timeline,
    area: lead.area,
    qualification: (lead.qualification as Record<string, unknown>) ?? {},
    escalated: esc,
    minutes,
    tier: tierFor(minutes),
    primary,
    classes,
    messages,
    viewing,
  }
}

async function getMessages(leadId: string): Promise<Message[]> {
  const { data, error } = await admin()
    .from('messages')
    .select('id, direction, body, status, ai_generated, created_at')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true })
    .limit(300)

  if (error) throw new Error(`messages query failed: ${error.message}`)

  return (data ?? []).map((m) => ({
    id: m.id as string,
    direction: (m.direction as 'inbound' | 'outbound') ?? 'inbound',
    body: (m.body as string) ?? null,
    status: (m.status as string) ?? null,
    aiGenerated: Boolean(m.ai_generated),
    createdAt: m.created_at as string,
  }))
}

/**
 * The booking, if there is one. Read from the event log rather than from a
 * lead column, because the event log is what actually records that a
 * calendar entry was created — §1 rule 14 of the lessons file: check the
 * artefact, not the thing that claims the artefact exists.
 */
async function getViewing(leadId: string) {
  const { data, error } = await admin()
    .from('events')
    .select('type, summary, data, created_at')
    .eq('type', 'viewing.booked')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return null

  const hit = (data ?? []).find((e) => {
    const d = e.data as Record<string, unknown> | null
    return d && d.lead_id === leadId
  })
  if (!hit) return null

  const d = hit.data as Record<string, unknown>
  const startsAt =
    typeof d.starts_at === 'string'
      ? d.starts_at
      : typeof d.slot === 'string'
        ? d.slot
        : null

  return { startsAt, summary: (hit.summary as string) ?? null }
}
