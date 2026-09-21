/*
 * What the automation business did in a month, what is holding it, and its
 * Firsts. Brief I §2.10 ("What the system did — measured, never estimated",
 * "Firsts", "What is holding it").
 *
 * PURE: rows in, a model out. The reads are in ./activity-read.ts.
 *
 *   🔒 Real clients only (clients.rehearsal = false). Rehearsals and the
 *      deploy gate's test clients are counted on ONE separate line — a right
 *      number about a different scope, never a correction to the one above.
 *   🔒 Replies by the system are messages.origin = 'ai', never
 *      metrics_daily.messages_sent (which counts every outbound row).
 *   🔒 "Introductory meetings booked", never "viewings": the Concierge books a
 *      meeting with one of the agency's people (improvements §3.15). The event
 *      is still called viewing.booked.
 *   🔒 A month is the business's month in Lisbon: a row counts in the month of
 *      its Lisbon date, not its UTC one.
 *   🔒 What is holding an automation comes from the gated ledger (lib/gates.ts),
 *      the only place a wait on a person is written — never restated here.
 */

import { gatesHoldingAutomation, type AutomationKey } from '@/lib/gates'
import { firstDay, lastDay, lisbonToday, monthOf, type ContractRow, type Month, type PaymentRow } from './model'

export type EventRow = { client_id: string | null; type: string; created_at: string }
export type MessageRow = { client_id: string | null; lead_id: string | null; direction: string; origin: string | null; created_at: string }

export const lisbonDate = (ts: string) => lisbonToday(new Date(ts))
const inMonth = (ts: string, M: Month) => {
  const d = lisbonDate(ts)
  return d >= firstDay(M) && d <= lastDay(M)
}

export type Counts = {
  leads: number
  systemReplies: number
  handedOver: number
  personReplies: number
  meetings: number
  /** median seconds from a lead's first inbound in the month to the first outbound after it; null = no sample */
  medianFirstReplySeconds: number | null
  firstReplySamples: number
  clients: number
}

export function countsFor(events: EventRow[], messages: MessageRow[], scope: Set<string>, M: Month): Counts {
  const ev = events.filter((e) => e.client_id && scope.has(e.client_id) && inMonth(e.created_at, M))
  const ms = messages.filter((m) => m.client_id && scope.has(m.client_id) && inMonth(m.created_at, M))
  const n = (t: string) => ev.filter((e) => e.type === t).length
  // time to first reply, per lead: the first inbound this month, then the first outbound after it
  const byLead = new Map<string, MessageRow[]>()
  for (const m of ms) if (m.lead_id) byLead.set(m.lead_id, [...(byLead.get(m.lead_id) ?? []), m])
  const gaps: number[] = []
  for (const rows of byLead.values()) {
    rows.sort((a, b) => a.created_at.localeCompare(b.created_at))
    const first = rows.find((r) => r.direction === 'inbound')
    if (!first) continue
    const reply = rows.find((r) => r.direction === 'outbound' && r.created_at > first.created_at)
    if (reply) gaps.push((Date.parse(reply.created_at) - Date.parse(first.created_at)) / 1000)
  }
  gaps.sort((a, b) => a - b)
  const median = gaps.length ? (gaps.length % 2 ? gaps[(gaps.length - 1) / 2] : (gaps[gaps.length / 2 - 1] + gaps[gaps.length / 2]) / 2) : null
  const active = new Set([...ev.map((e) => e.client_id), ...ms.map((m) => m.client_id)].filter(Boolean))
  return {
    leads: n('lead.created'),
    systemReplies: ms.filter((m) => m.direction === 'outbound' && m.origin === 'ai').length,
    handedOver: n('lead.escalated'),
    personReplies: ms.filter((m) => m.direction === 'outbound' && m.origin === 'human').length,
    meetings: n('viewing.booked'),
    medianFirstReplySeconds: median,
    firstReplySamples: gaps.length,
    clients: active.size,
  }
}

// ---------------------------------------------------------------- automations

export const AUTOMATION_LINE: { key: AutomationKey; label: string }[] = [
  { key: 'inbound_concierge', label: '01 · Concierge' },
  { key: 'db_reactivation', label: '02 · Database reactivation' },
  { key: 'lead_nurture', label: '03 · Listing match' },
  { key: 'listing_launch', label: '04 · Publication gate' },
  { key: 'reputation_loop', label: '05 · Review requests' },
]

export type AutomationLine = {
  key: AutomationKey
  label: string
  /** real clients with this automation switched on */
  runsFor: number
  /** the first open gate holding it, from the ledger; null when nothing holds it */
  heldBy: { who: string; what: string; since: string | null; days: number | null } | null
}

export function automationLines(runsFor: Map<AutomationKey, number>, today: string): AutomationLine[] {
  return AUTOMATION_LINE.map(({ key, label }) => {
    const g = gatesHoldingAutomation(key)[0]?.gate
    const days = g?.since ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${g.since}T00:00:00Z`)) / 86_400_000) : null
    return { key, label, runsFor: runsFor.get(key) ?? 0, heldBy: g ? { who: g.whoHolds, what: g.what, since: g.since ?? null, days } : null }
  })
}

// ---------------------------------------------------------------- firsts

export type First =
  | { kind: 'happened'; label: string; on: string }
  | { kind: 'never'; label: string }
  | { kind: 'held'; label: string; who: string; since: string | null; days: number | null }

/** The earliest of a list of ISO timestamps or dates, as a Lisbon date; null when empty. */
const earliest = (xs: (string | null | undefined)[]) => {
  const ds = xs.filter((x): x is string => !!x).map((x) => (x.length > 10 ? lisbonDate(x) : x)).sort()
  return ds[0] ?? null
}

export type FirstsInputs = {
  /** earliest created_at (or started_on) of a real client; null = none */
  firstClient: string | null
  firstLead: string | null
  firstSystemReply: string | null
  firstMeeting: string | null
  contracts: ContractRow[]
  payments: PaymentRow[]
  realParties: Set<string>
}

/**
 * The first full month of recurring revenue: the earliest CLOSED month that a
 * real contract covers from its first day to its last. Null until one exists.
 */
export function firstFullMonth(contracts: ContractRow[], realParties: Set<string>, today: string): string | null {
  let best: string | null = null
  for (const c of contracts) {
    const party = c.automation_client_id ?? c.web_client_id
    if (!party || !realParties.has(party)) continue
    let M = monthOf(c.starts_on)
    if (c.starts_on !== firstDay(M)) M = { y: M.m === 12 ? M.y + 1 : M.y, m: M.m === 12 ? 1 : M.m + 1 }
    if (lastDay(M) >= today) continue // not closed yet
    if (c.ends_on !== null && c.ends_on < lastDay(M)) continue
    if (!best || firstDay(M) < best) best = firstDay(M)
  }
  return best
}

export function firstsFor(f: FirstsInputs, today: string): First[] {
  const real = (x: { automation_client_id: string | null; web_client_id: string | null }) => {
    const p = x.automation_client_id ?? x.web_client_id
    return !!p && f.realParties.has(p)
  }
  const held = (key: AutomationKey, label: string): First | null => {
    const g = gatesHoldingAutomation(key)[0]?.gate
    if (!g) return null
    const days = g.since ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${g.since}T00:00:00Z`)) / 86_400_000) : null
    return { kind: 'held', label, who: g.whoHolds, since: g.since ?? null, days }
  }
  const one = (label: string, on: string | null): First => (on ? { kind: 'happened', label, on } : { kind: 'never', label })
  const full = firstFullMonth(f.contracts, f.realParties, today)
  return [
    one('First client', earliest([f.firstClient])),
    one('First lead handled', earliest([f.firstLead])),
    one('First reply by the system', earliest([f.firstSystemReply])),
    one('First introductory meeting booked', earliest([f.firstMeeting])),
    one('First contract', earliest(f.contracts.filter(real).map((c) => c.starts_on))),
    one('First setup payment', earliest(f.payments.filter((p) => real(p) && p.kind === 'setup' && p.settled_on).map((p) => p.settled_on))),
    one('First full month of recurring revenue', full),
    held('db_reactivation', 'First campaign send') ?? one('First campaign send', null),
    held('reputation_loop', 'First review request') ?? one('First review request', null),
  ]
}

