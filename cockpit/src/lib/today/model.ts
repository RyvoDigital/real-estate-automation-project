/**
 * Today, as a model: the five groups, their counts, their previews and their
 * states, decided here and nowhere else. Brief §2.1, and its "Organisation" and
 * "Tiers are positions" decisions of 19 Sep 2026. The Today rebuild, checkpoint 1
 * (22 Sep 2026).
 *
 * PURE: the reads go in (the queue, the anomaly feed, whether any client has an
 * automation on, the expiries module, the gated ledger), five groups come out. The page (checkpoint
 * 2) will only draw it; tests/today-model.test.ts holds every rule below.
 *
 *   🔒 FIVE GROUPS IN A FIXED ORDER, NEVER SORTED ACROSS. There is no score on a
 *      group and no global sort anywhere in this file: minutes for an
 *      escalation, days for a certificate and weeks for a lawyer are not ranked
 *      against each other (§4.6).
 *   🔒 A PREVIEW IS ITS OWN GROUP'S MOST URGENT ITEM, BY ITS OWN CLOCK: longest
 *      waiting (1), most recent (2), most overdue (3), soonest AND longest
 *      unconfirmed (4: two lists, two heads), longest waiting (5). Never the
 *      most urgent item on the page.
 *   🔒 GROUPS 3 AND 4 ARE PARTIAL AND SAY SO, naming what is tracked and that
 *      clearances are not; they read lib/expiries, the one source /ops/expiries
 *      will read in C5 (checkpoint 2, 22 Sep 2026).
 *   🔒 GROUP 5 IS THE PLAIN LIST (decided 22 Sep 2026; recorded in gates.ts):
 *      read-only, no actions, the ledger's order.
 *   🔒 EVERY GROUP OPENS COLLAPSED (decided 19 Sep 2026). Collapse is never
 *      remembered.
 *   🔒 EVERY COUNT CARRIES ITS DENOMINATOR (§0.4): what was read, and the cap,
 *      so a capped read says "100+", never a silent 100.
 *   🔒 A group that could not be read says so, and the other four still render.
 *   🔒 S2 (no client has any automation on) is its own whole-screen sentence,
 *      different in words from a resting group.
 */

import { tierFor, TIER_WORD, humanise, detectOutage, type Tier } from '@/lib/escalation'
import { whyEmpty } from '@/lib/why-empty'
import type { AnomalyGroup } from '@/lib/anomaly'
import type { Expiries, ExpiryItem } from '@/lib/expiries/model'

/** The fields of a queue row the model reads (lib/data.ts QueueRow). */
export type TodayQueueRow = {
  id: string; name: string; clientId: string; clientName: string
  at: string | null; minutes: number; reasons: string[]
  handledElsewhere: boolean; handledAt: string | null
}

export type TodayInputs = {
  queue: { rows: TodayQueueRow[] | null; threw: string; cap: number }
  anomalies: { groups: AnomalyGroup[] | null; total: number; capped: boolean; threw: string; windowDays: number }
  /** clients with any automation switched on; null = the read failed */
  clientsWithAutomation: number | null
  /** groups 3 and 4: the one expiries module (lib/expiries), partial and saying so */
  expiries: Expiries
  /** group 5: the gated ledger's OPEN gates, oldest first (gates.ts openGatesOldestFirst) */
  waiting: WaitingGate[]
  now: Date
}

/** One open gate, as group 5 draws it: what waits, who holds it, since when, who can end it. */
export type WaitingGate = { id: string; what: string; whoHolds: string; since: string | null; answerable: 'the agency' | 'outside'; expected?: { on: string; what: string } | null; thenHeldBy?: string | null }

export type GroupState = 'rows' | 'resting' | 'readFailed'

export type TodayGroup = {
  n: 1 | 2 | 3 | 4 | 5
  name: string
  state: GroupState
  /** 🔒 always false: every group opens collapsed */
  open: false
  /** the count as the header states it, denominator included */
  count: string
  /** one line: this group's own most urgent item, or why it is empty */
  preview: string
  /** group 4 only: the SECOND list's head (to confirm), on its own line; never merged into one ranking */
  also: string | null
  /** group 1: waiting rows by tier (settled, ageing, late, breach); group 2: by severity */
  distribution: { label: string; n: number }[]
  /** a read failure's thrown sentence, as thrown: rendered in mono under the preview (why-empty.ts leaves it to the caller) */
  detail: string | null
  /** 🔒 groups 3 and 4 are PARTIAL and say so: what is tracked, and that clearances are not */
  partial: string | null
}

export type TodayModel = {
  /** S2: whole screen. null when at least one client has an automation on */
  never: string | null
  groups: TodayGroup[]
  outage: ReturnType<typeof detectOutage>
  /** the rows groups 3, 4 and 5 draw, each list in its own clock's order */
  runOut: ExpiryItem[]
  aboutTo: ExpiryItem[]
  toConfirm: ExpiryItem[]
  waiting: WaitingGate[]
  /** group 4's first list's horizon, from still-good.ts, never re-typed on the page */
  warnWithinDays: number
}

const NAMES = {
  1: 'Waiting on a human',
  2: 'Something went wrong',
  3: 'Something has run out',
  4: 'Something is about to run out',
  5: 'Waiting on someone else',
} as const

function group1(q: TodayInputs['queue']): TodayGroup {
  const base = { n: 1 as const, name: NAMES[1], open: false as const, also: null }
  if (q.rows === null) {
    return { ...base, state: 'readFailed', count: 'could not be read', distribution: [], detail: q.threw || null, partial: null,
      preview: whyEmpty({ state: 'readFailed', thing: 'the queue', threw: q.threw }).sentence }
  }
  const waiting = q.rows.filter((r) => !r.handledElsewhere)
  const handled = q.rows.length - waiting.length
  const read = q.rows.length
  const capped = read >= q.cap
  const readText = capped ? `${q.cap}+ read · cap ${q.cap}` : `${read} read · cap ${q.cap}`
  if (waiting.length === 0) {
    return { ...base, state: 'resting', distribution: [], detail: null, partial: null,
      count: handled ? `nobody waiting · ${handled} handled elsewhere · ${readText}` : `nobody waiting · ${readText}`,
      preview: whyEmpty({ state: 'resting', thing: 'escalations', welcome: true }).sentence }
  }
  // Longest waiting, by this group's own clock: computed, never assumed from the read's order.
  const longest = waiting.reduce((a, b) => (b.minutes > a.minutes ? b : a))
  const byTier = new Map<Tier, number>()
  for (const r of waiting) byTier.set(tierFor(r.minutes), (byTier.get(tierFor(r.minutes)) ?? 0) + 1)
  const distribution = ([3, 2, 1, 0] as Tier[]).filter((t) => byTier.get(t)).map((t) => ({ label: TIER_WORD[t].toLowerCase(), n: byTier.get(t)! }))
  return { ...base, state: 'rows', distribution, detail: null, partial: null,
    count: `${capped ? `${waiting.length}+` : waiting.length} waiting` + (handled ? ` · ${handled} handled elsewhere` : '') + ` · ${readText}`,
    preview: `Longest: ${humanise(longest.reasons[0] ?? '')} · ${longest.clientName}` }
}

function group2(a: TodayInputs['anomalies']): TodayGroup {
  const base = { n: 2 as const, name: NAMES[2], open: false as const, also: null }
  const scope = `in the last ${a.windowDays} days`
  if (a.groups === null) {
    return { ...base, state: 'readFailed', count: 'could not be read', distribution: [], detail: a.threw || null, partial: null,
      preview: whyEmpty({ state: 'readFailed', thing: 'the anomaly log', threw: a.threw }).sentence }
  }
  if (a.groups.length === 0) {
    return { ...base, state: 'resting', distribution: [], detail: null, partial: null, count: `none ${scope}`,
      preview: whyEmpty({ state: 'resting', thing: 'anomalies', scope }).sentence }
  }
  // Most recent, by this group's own clock.
  const newest = a.groups.reduce((x, y) => (Date.parse(y.latest.at) > Date.parse(x.latest.at) ? y : x))
  const critical = a.groups.filter((g) => g.latest.severity === 'critical').length
  const warning = a.groups.length - critical
  return { ...base, state: 'rows', detail: null, partial: null,
    distribution: [{ label: 'critical', n: critical }, { label: 'warning', n: warning }].filter((d) => d.n),
    count: `${a.groups.length} ${a.groups.length === 1 ? 'fault' : 'faults'} · ${a.capped ? `${a.total}+` : a.total} occurrences ${scope}`,
    preview: `Newest: ${newest.latest.label} · ${newest.count}× ${scope}` }
}

const whose = (x: ExpiryItem) => (x.owner.kind === 'ryvo' ? 'Ryvo' : x.owner.name)
const lisbonDay = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Lisbon' })

function checkedText(e: Expiries): string {
  const parts = [
    e.checked.deployKeys ? 'the deploy key' : null,
    `${e.checked.documents} document${e.checked.documents === 1 ? '' : 's'}`,
    `${e.checked.registrations} registration${e.checked.registrations === 1 ? '' : 's'}`,
  ].filter(Boolean)
  return `checked ${parts.join(', ')} across ${e.checked.clients} client${e.checked.clients === 1 ? '' : 's'}`
}

function partialLine(e: Expiries): string {
  return `Partial: this tracks ${e.tracked.join(', ')}. Not yet: ${e.notTracked.join('; ')}.`
}

function group3(e: Expiries): TodayGroup {
  const base = { n: 3 as const, name: NAMES[3], open: false as const, partial: partialLine(e), distribution: [], also: null }
  const failed = e.failures.length ? e.failures.join(' ') : null
  if (e.checked.deployKeys === 0 && e.checked.clients === 0 && failed) {
    return { ...base, state: 'readFailed', count: 'could not be read', detail: failed,
      preview: whyEmpty({ state: 'readFailed', thing: 'what has run out', threw: failed }).sentence }
  }
  if (e.runOut.length === 0) {
    return { ...base, state: 'resting', detail: failed, count: `nothing run out · ${checkedText(e)}`,
      preview: `Nothing tracked has run out. ${checkedText(e).replace(/^c/, 'C')}.` }
  }
  // Most overdue, by this group's own clock (the module's order).
  const head = e.runOut[0]
  return { ...base, state: 'rows', detail: failed,
    count: `${e.runOut.length} run out · ${checkedText(e)}`,
    preview: `Longest past: ${head.what} · ${whose(head)}` + (head.days !== null ? ` · ${-head.days} day${head.days === -1 ? '' : 's'} ago` : '') }
}

function group4(e: Expiries): TodayGroup {
  const base = { n: 4 as const, name: NAMES[4], open: false as const, partial: partialLine(e), distribution: [], also: null }
  const failed = e.failures.length ? e.failures.join(' ') : null
  if (e.checked.deployKeys === 0 && e.checked.clients === 0 && failed) {
    return { ...base, state: 'readFailed', count: 'could not be read', detail: failed,
      preview: whyEmpty({ state: 'readFailed', thing: 'what is about to run out', threw: failed }).sentence }
  }
  const lists = `${e.aboutTo.length} within ${e.warnWithinDays} days · ${e.toConfirm.length} to confirm`
  if (e.aboutTo.length === 0 && e.toConfirm.length === 0) {
    return { ...base, state: 'resting', detail: failed, count: `${lists} · ${checkedText(e)}`,
      preview: `Nothing tracked runs out within ${e.warnWithinDays} days, and nothing waits to be confirmed.` }
  }
  // 🔒 TWO heads, one per list: two clocks, and choosing one head would rank them (brief §2.1).
  const soon = e.aboutTo[0], conf = e.toConfirm[0]
  const soonLine = soon
    ? `Soonest: ${soon.what} · ${whose(soon)}${soon.days !== null ? ` · in ${soon.days} day${soon.days === 1 ? '' : 's'}` : ' · date not asserted'}`
    : `Nothing tracked runs out within ${e.warnWithinDays} days.`
  const confLine = conf ? `Longest unconfirmed: ${conf.what} · ${whose(conf)}` : 'Nothing waits to be confirmed.'
  return { ...base, state: 'rows', detail: failed, count: `${lists} · ${checkedText(e)}`, preview: soonLine, also: confLine }
}

function group5(w: WaitingGate[], now: Date): TodayGroup {
  const base = { n: 5 as const, name: NAMES[5], open: false as const, partial: null, detail: null, distribution: [], also: null }
  // The ledger is one file, read whole: there is no cap, and the count says so.
  const read = `all ${w.length} read · the ledger, uncapped`
  if (w.length === 0) {
    return { ...base, state: 'resting', count: `nobody waited on · ${read}`,
      preview: 'The gated ledger has no open gate: nothing waits on anybody outside.' }
  }
  // Longest waiting, by this group's own clock: the ledger hands them oldest first, undated last.
  const head = w[0]
  const byWho = [
    { label: 'the agency can end', n: w.filter((g) => g.answerable === 'the agency').length },
    { label: 'the agency cannot end', n: w.filter((g) => g.answerable === 'outside').length },
  ].filter((d) => d.n)
  const days = head.since ? Math.floor((now.getTime() - Date.parse(`${head.since}T00:00:00Z`)) / 86_400_000) : null
  return { ...base, state: 'rows', distribution: byWho,
    count: `${w.length} waiting · ${read}`,
    preview: `Longest: ${head.what} · ${head.whoHolds}` + (head.since ? ` · since ${lisbonDay(head.since)}${days !== null ? ` (${days} days)` : ''}` : ' · since unknown') }
}

export function buildToday(i: TodayInputs): TodayModel {
  const never = i.clientsWithAutomation === 0
    ? 'No client has any automation switched on, so nothing can be waiting on anybody yet. That is not the same as a quiet day.'
    : null
  // 🔒 the ledger's own order (gates.ts openGatesOldestFirst), never re-ordered here
  const waiting = i.waiting
  const groups: TodayGroup[] = [group1(i.queue), group2(i.anomalies), group3(i.expiries), group4(i.expiries), group5(waiting, i.now)]
  const outage = detectOutage((i.queue.rows ?? []).map((r) => ({ at: r.at, reasons: r.reasons })))
  return { never, groups, outage, runOut: i.expiries.runOut, aboutTo: i.expiries.aboutTo, toConfirm: i.expiries.toConfirm, waiting, warnWithinDays: i.expiries.warnWithinDays }
}
