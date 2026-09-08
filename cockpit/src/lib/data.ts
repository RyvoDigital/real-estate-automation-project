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
  handledElsewhere: boolean
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
/**
 * How many leads are waiting — the number on the Queue tab, and nothing else.
 *
 * Every screen renders that badge, so every screen was running the full
 * getQueue(): client names, last inbound message per lead, and a
 * replies-since-escalation scan, all thrown away to produce one integer. On
 * /leads and /report that ran alongside three more round trips to a database
 * on another continent.
 *
 * IT MUST COUNT EXACTLY WHAT getQueue() WOULD RETURN, so it uses the same
 * predicate AND the same parseEscalated() — including the belt-and-braces skip
 * for a row whose `escalated` key is present but unreadable. A `count: exact`
 * head query would have been one fewer byte and a different number.
 * tests/probe-queue.ts asserts the two agree.
 */
export async function getOpenCount(limit = 100): Promise<number> {
  const { data, error } = await admin()
    .from('leads')
    .select('qualification')
    .not('qualification->>escalated', 'is', null)
    .limit(limit)

  if (error) throw new Error(`open count query failed: ${error.message}`)
  return (data ?? []).filter((l) => parseEscalated(l.qualification)).length
}

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
  // Three independent lookups keyed off the same lead set. They were awaited
  // one after another, which cost three serial round trips to Supabase for no
  // reason: none of them reads the others' output. Same queries, same results,
  // timing only.
  const [clientNames, lastMessages, answered] = await Promise.all([
    getClientNames(rows.map((l) => l.client_id)),
    getLastInboundMessages(rows.map((l) => l.id)),
    getRepliesSinceEscalation(rows),
  ])
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
      handledElsewhere: answered.has(lead.id),
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

/**
 * Leads that have had an outbound message since they were escalated, which
 * the cockpit did not send. §5.3: Manuel will sometimes just reply in
 * WhatsApp, and doing the obvious thing must not leave a stuck row.
 *
 * Cockpit sends are identifiable because they set approved_by_human = true.
 * Anything else outbound after the escalation was somebody else — either a
 * human elsewhere, or the assistant resuming when it should not have.
 *
 * EXCEPT the handoff note. When the Concierge escalates it immediately sends
 * "a colleague will continue the conversation", and StoreHandoffMessage
 * writes that with ai_generated: false and approved_by_human: null — which is
 * byte-identical to what a human replying elsewhere would look like, about
 * 0.6 seconds after the escalation timestamp. Without the grace window below
 * this fires on EVERY escalated lead, and a marker that is always wrong is
 * worse than no marker: it teaches you to ignore it. Caught by opening the
 * screen and seeing the banner on a lead nobody had touched.
 *
 * KNOWN LIMIT, and it is a real one: this only fires if a row EXISTS. A
 * message typed into WhatsApp on a phone reaches Twilio, not n8n, so unless
 * outbound status callbacks are recorded there is nothing to find. The
 * detection is correct and may simply never trigger — which is a
 * consumer-without-a-producer, the mirror of instance 15. Verified as far as
 * the query goes; NOT verified end to end from a real WhatsApp reply.
 */
/**
 * How long after an escalation an outbound message is assumed to be the
 * assistant's own handoff note rather than a human. The note goes out within
 * a second; a person picking up their phone takes longer than two minutes.
 */
const HANDOFF_GRACE_MS = 120_000

async function getRepliesSinceEscalation(rows: LeadRow[]): Promise<Set<string>> {
  const escalatedAt = new Map<string, string>()
  for (const lead of rows) {
    const esc = parseEscalated(lead.qualification)
    if (esc?.at) escalatedAt.set(lead.id, esc.at)
  }
  if (escalatedAt.size === 0) return new Set()

  const { data, error } = await admin()
    .from('messages')
    .select('lead_id, created_at, approved_by_human, ai_generated')
    .in('lead_id', [...escalatedAt.keys()])
    .eq('direction', 'outbound')
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) throw new Error(`outbound scan failed: ${error.message}`)

  const out = new Set<string>()
  for (const m of data ?? []) {
    const id = m.lead_id as string
    const at = escalatedAt.get(id)
    if (!at) continue
    if (m.approved_by_human === true) continue // the cockpit sent this one
    if (Date.parse(m.created_at as string) > Date.parse(at) + HANDOFF_GRACE_MS) out.add(id)
  }
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
  approvedByHuman: boolean
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
  handledElsewhere: boolean
  viewing: { startsAt: string | null; kind: 'viewing' | 'meeting' | null; summary: string | null } | null
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
    handledElsewhere: esc?.at
      ? messages.some(
          (m) =>
            m.direction === 'outbound' &&
            !m.approvedByHuman &&
            Date.parse(m.createdAt) > Date.parse(esc.at as string) + HANDOFF_GRACE_MS,
        )
      : false,
    viewing,
  }
}

async function getMessages(leadId: string): Promise<Message[]> {
  const { data, error } = await admin()
    .from('messages')
    .select('id, direction, body, status, ai_generated, approved_by_human, created_at')
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
    approvedByHuman: m.approved_by_human === true,
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
  // An appointment is a viewing only when a specific property was named. Older
  // rows predate the field and are shown as what they honestly are: booked,
  // kind unknown. Never defaulted to 'viewing' — that default is the defect.
  const kind: 'viewing' | 'meeting' | null =
    d.kind === 'viewing' ? 'viewing' : d.kind === 'meeting' ? 'meeting' : null
  const startsAt =
    typeof d.starts_at === 'string'
      ? d.starts_at
      : typeof d.slot === 'string'
        ? d.slot
        : null

  return { startsAt, kind, summary: (hit.summary as string) ?? null }
}

// ---------------------------------------------------------------- all leads

export type LeadFilters = {
  client?: string
  stage?: string
  escalated?: 'yes' | 'no'
  q?: string
  page?: number
}

export type LeadListRow = {
  id: string
  name: string
  phone: string | null
  clientName: string
  stage: string
  budget: number | null
  area: string | null
  escalated: boolean
  minutes: number
  lastContactAt: string | null
}

export const LEADS_PER_PAGE = 25

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Every lead, filtered and paginated.
 *
 * Paginated in the DATABASE, not in the page. §8: a screen built against
 * three rows can look fine and fall apart at three hundred, and this is the
 * only screen whose row count grows without bound. `count: 'exact'` gives
 * the total so the pager can say where you are.
 *
 * The search is a single `or` across name and phone rather than two round
 * trips. Both operands are escaped: PostgREST's `or` filter is a
 * comma-separated mini-language, so an unescaped comma or paren in user
 * input changes the QUERY rather than being searched for.
 */
export async function getLeads(f: LeadFilters): Promise<{
  rows: LeadListRow[]
  total: number
  page: number
  pages: number
}> {
  // Apply the same filters to both queries from one place. Two copies of a
  // filter chain is two chances for the count and the rows to disagree.
  const applyFilters = <T extends { eq: Function; not: Function; is: Function; or: Function }>(
    query: T,
  ): T => {
    let q2 = query
    // A client id that is not a uuid reaches Postgres as a bad cast and comes
    // back as a 500 — from a URL anyone can type. Same class as the
    // out-of-range page above: hostile input gets ignored, never crashed on.
    if (f.client && UUID.test(f.client)) q2 = q2.eq('client_id', f.client)
    if (f.stage) q2 = q2.eq('stage', f.stage)
    if (f.escalated === 'yes') q2 = q2.not('qualification->>escalated', 'is', null)
    if (f.escalated === 'no') q2 = q2.is('qualification->>escalated', null)

    const term = (f.q ?? '').trim()
    if (term) {
      // PostgREST's `or` filter is a comma-separated mini-language, so an
      // unescaped comma or paren in user input changes the QUERY rather than
      // being searched for. Strip the grammar characters.
      const safe = term.replace(/[,()\\*]/g, ' ').trim()
      if (safe) q2 = q2.or(`full_name.ilike.*${safe}*,phone.ilike.*${safe}*`)
    }
    return q2
  }

  // Count first, so the page can be CLAMPED. Asking PostgREST for a range
  // past the end is a 416, which surfaced as a 500 on /leads?page=99 — a URL
  // anyone can type, and a crash is not an acceptable answer to it.
  const { count, error: countErr } = await applyFilters(
    admin().from('leads').select('id', { count: 'exact', head: true }),
  )
  if (countErr) throw new Error(`leads count failed: ${countErr.message}`)

  const total = count ?? 0
  const pages = Math.max(1, Math.ceil(total / LEADS_PER_PAGE))
  const page = Math.min(Math.max(1, f.page ?? 1), pages)
  const from = (page - 1) * LEADS_PER_PAGE

  if (total === 0) return { rows: [], total: 0, page: 1, pages: 1 }

  const { data, error } = await applyFilters(
    admin()
      .from('leads')
      .select(
        'id, full_name, phone, client_id, stage, budget_min, budget_max, area, qualification, last_contact_at',
      ),
  )
    .order('last_contact_at', { ascending: false, nullsFirst: false })
    .range(from, from + LEADS_PER_PAGE - 1)

  if (error) throw new Error(`leads list failed: ${error.message}`)

  const rows = (data ?? []) as LeadRow[]
  const names = await getClientNames(rows.map((l) => l.client_id))
  const now = Date.now()

  return {
    rows: rows.map((l) => {
      const esc = parseEscalated(l.qualification)
      const hi = Math.max(Number(l.budget_max ?? 0), Number(l.budget_min ?? 0))
      return {
        id: l.id,
        name: l.full_name ?? 'Unknown lead',
        phone: l.phone,
        clientName: names.get(l.client_id) ?? 'Unknown client',
        stage: l.stage ?? 'new',
        budget: hi || null,
        area: l.area,
        escalated: Boolean(esc),
        minutes: esc ? minutesSince(esc.at, now) : 0,
        lastContactAt: l.last_contact_at,
      }
    }),
    total,
    page,
    pages,
  }
}

export async function getClients(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await admin().from('clients').select('id, name').order('name')
  if (error) throw new Error(`clients failed: ${error.message}`)
  return (data ?? []).map((c) => ({ id: c.id as string, name: c.name as string }))
}

export const STAGES = [
  'new',
  'contacted',
  'qualified',
  'nurturing',
  'viewing_booked',
  'won',
  'lost',
  'dormant',
] as const

// ------------------------------------------------------------------ health

export type HealthRun = {
  ranAt: string
  ok: boolean
  passed: string[]
  failed: string[]
  durationMs: number | null
  host: string | null
}

/**
 * Anything older than this and the screen must say so loudly. Cron runs every
 * 10 minutes, so 25 leaves room for one missed run plus clock skew without
 * crying wolf — a screen that alarms on a normal gap gets ignored (§6b).
 */
export const HEALTH_STALE_MINUTES = Number(process.env.HEALTH_STALE_MINUTES ?? 25)

export async function getHealth(): Promise<HealthRun | null> {
  const { data, error } = await admin()
    .from('health_runs')
    .select('ran_at, ok, passed, failed, duration_ms, host')
    .order('ran_at', { ascending: false })
    .limit(1)

  if (error) throw new Error(`health query failed: ${error.message}`)
  const r = (data ?? [])[0]
  if (!r) return null

  return {
    ranAt: r.ran_at as string,
    ok: Boolean(r.ok),
    passed: (r.passed as string[]) ?? [],
    failed: (r.failed as string[]) ?? [],
    durationMs: (r.duration_ms as number) ?? null,
    host: (r.host as string) ?? null,
  }
}

// ---------------------------------------------------------- weekly report

export type DayMetrics = {
  date: string
  /**
   * Three states, not two, because "no row" means different things:
   *
   *   derived  a row exists. Zeros here mean nothing happened.
   *   missing  the day is PAST and has no row — the nightly derivation did
   *            not run, so any total including it is incomplete.
   *   future   the day has not happened yet. Not a fault, and flagging it
   *            red would be a check that alarms on a normal state, which is
   *            how checks get ignored (§6b).
   *
   * Collapsing missing and future into one "no row" case is what the first
   * version did, and it painted the rest of the current week as a failure.
   */
  state: 'derived' | 'missing' | 'future'
  row: {
    leadsNew: number
    leadsQualified: number
    viewingsBooked: number
    messagesSent: number
    escalations: number
  } | null
}

export type WeeklyReport = {
  clientId: string
  clientName: string
  start: string
  end: string
  days: DayMetrics[]
  totals: {
    leadsNew: number
    leadsQualified: number
    viewingsBooked: number
    messagesSent: number
    escalations: number
  }
  derivedDays: number
  missingDays: string[]
}

/** Monday of the week containing `d`, in ISO date form. */
export function mondayOf(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dow = (x.getUTCDay() + 6) % 7 // Monday = 0
  x.setUTCDate(x.getUTCDate() - dow)
  return x.toISOString().slice(0, 10)
}

/** The most recent COMPLETE week — the one a Monday report would cover. */
export function lastCompleteWeekStart(now = new Date()): string {
  const thisMonday = new Date(`${mondayOf(now)}T00:00:00Z`)
  thisMonday.setUTCDate(thisMonday.getUTCDate() - 7)
  return thisMonday.toISOString().slice(0, 10)
}

/**
 * A week of numbers for one client.
 *
 * EVERY FIGURE COMES FROM metrics_daily AND NOTHING IS RECOMPUTED HERE.
 * §9: two systems computing the same number differently is a bug generator,
 * and the client-facing report is the worst possible place to discover that
 * the cockpit and the nightly derivation disagree. metrics_daily.py derives
 * from the event log; this function sums its rows and does no counting of
 * its own.
 *
 * Missing days are surfaced rather than summed as zero. A day with a row of
 * zeros means nothing happened; a day with NO row means the derivation did
 * not run, and a client told "0 leads" for a day nobody measured is being
 * told something false. The health check asserts a row exists for yesterday
 * for exactly this reason.
 */
export async function getWeeklyReport(clientId: string, weekStart: string): Promise<WeeklyReport> {
  const start = new Date(`${weekStart}T00:00:00Z`)
  const dates: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(start)
    d.setUTCDate(d.getUTCDate() + i)
    dates.push(d.toISOString().slice(0, 10))
  }
  const end = dates[6]

  const [{ data: rows, error }, names] = await Promise.all([
    admin()
      .from('metrics_daily')
      .select('date, leads_new, leads_qualified, viewings_booked, messages_sent, escalations')
      .eq('client_id', clientId)
      .gte('date', weekStart)
      .lte('date', end),
    getClientNames([clientId]),
  ])
  if (error) throw new Error(`metrics query failed: ${error.message}`)

  const byDate = new Map<string, Record<string, number>>()
  for (const r of rows ?? []) byDate.set(r.date as string, r as unknown as Record<string, number>)

  const today = new Date().toISOString().slice(0, 10)

  const days: DayMetrics[] = dates.map((date) => {
    const r = byDate.get(date)
    return {
      date,
      state: r ? 'derived' : date > today ? 'future' : 'missing',
      row: r
        ? {
            leadsNew: Number(r.leads_new ?? 0),
            leadsQualified: Number(r.leads_qualified ?? 0),
            viewingsBooked: Number(r.viewings_booked ?? 0),
            messagesSent: Number(r.messages_sent ?? 0),
            escalations: Number(r.escalations ?? 0),
          }
        : null,
    }
  })

  const totals = days.reduce(
    (a, d) => ({
      leadsNew: a.leadsNew + (d.row?.leadsNew ?? 0),
      leadsQualified: a.leadsQualified + (d.row?.leadsQualified ?? 0),
      viewingsBooked: a.viewingsBooked + (d.row?.viewingsBooked ?? 0),
      messagesSent: a.messagesSent + (d.row?.messagesSent ?? 0),
      escalations: a.escalations + (d.row?.escalations ?? 0),
    }),
    { leadsNew: 0, leadsQualified: 0, viewingsBooked: 0, messagesSent: 0, escalations: 0 },
  )

  return {
    clientId,
    clientName: names.get(clientId) ?? 'Unknown client',
    start: weekStart,
    end,
    days,
    totals,
    derivedDays: days.filter((d) => d.state === 'derived').length,
    // Only PAST days count as missing. A week in progress is not a broken week.
    missingDays: days.filter((d) => d.state === 'missing').map((d) => d.date),
  }
}
