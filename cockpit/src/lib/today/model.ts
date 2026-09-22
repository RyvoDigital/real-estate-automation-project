/**
 * Today, as a model: the five groups, their counts, their previews and their
 * states, decided here and nowhere else. Brief §2.1, and its "Organisation" and
 * "Tiers are positions" decisions of 19 Sep 2026. The Today rebuild, checkpoint 1
 * (22 Sep 2026).
 *
 * PURE: the reads go in (the queue, the anomaly feed, whether any client has an
 * automation on, the gated ledger), five groups come out. The page (checkpoint
 * 2) will only draw it; tests/today-model.test.ts holds every rule below.
 *
 *   🔒 FIVE GROUPS IN A FIXED ORDER, NEVER SORTED ACROSS. There is no score on a
 *      group and no global sort anywhere in this file: minutes for an
 *      escalation, days for a certificate and weeks for a lawyer are not ranked
 *      against each other (§4.6).
 *   🔒 A PREVIEW IS ITS OWN GROUP'S MOST URGENT ITEM, BY ITS OWN CLOCK: longest
 *      waiting (1), most recent (2). Never the most urgent item on the page.
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
  /** open gates in the gated ledger (lib/gates.ts); group 5's source, not yet designed */
  openGates: number
}

export type GroupState = 'rows' | 'resting' | 'readFailed' | 'notBuilt' | 'notDesigned'

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
  /** group 1: waiting rows by tier (settled, ageing, late, breach); group 2: by severity */
  distribution: { label: string; n: number }[]
  /** a read failure's thrown sentence, as thrown: rendered in mono under the preview (why-empty.ts leaves it to the caller) */
  detail: string | null
}

export type TodayModel = {
  /** S2: whole screen. null when at least one client has an automation on */
  never: string | null
  groups: TodayGroup[]
  outage: ReturnType<typeof detectOutage>
}

const NAMES = {
  1: 'Waiting on a human',
  2: 'Something went wrong',
  3: 'Something has run out',
  4: 'Something is about to run out',
  5: 'Waiting on someone else',
} as const

function group1(q: TodayInputs['queue']): TodayGroup {
  const base = { n: 1 as const, name: NAMES[1], open: false as const }
  if (q.rows === null) {
    return { ...base, state: 'readFailed', count: 'could not be read', distribution: [], detail: q.threw || null,
      preview: whyEmpty({ state: 'readFailed', thing: 'the queue', threw: q.threw }).sentence }
  }
  const waiting = q.rows.filter((r) => !r.handledElsewhere)
  const handled = q.rows.length - waiting.length
  const read = q.rows.length
  const capped = read >= q.cap
  const readText = capped ? `${q.cap}+ read · cap ${q.cap}` : `${read} read · cap ${q.cap}`
  if (waiting.length === 0) {
    return { ...base, state: 'resting', distribution: [], detail: null,
      count: handled ? `nobody waiting · ${handled} handled elsewhere · ${readText}` : `nobody waiting · ${readText}`,
      preview: whyEmpty({ state: 'resting', thing: 'escalations', welcome: true }).sentence }
  }
  // Longest waiting, by this group's own clock: computed, never assumed from the read's order.
  const longest = waiting.reduce((a, b) => (b.minutes > a.minutes ? b : a))
  const byTier = new Map<Tier, number>()
  for (const r of waiting) byTier.set(tierFor(r.minutes), (byTier.get(tierFor(r.minutes)) ?? 0) + 1)
  const distribution = ([3, 2, 1, 0] as Tier[]).filter((t) => byTier.get(t)).map((t) => ({ label: TIER_WORD[t].toLowerCase(), n: byTier.get(t)! }))
  return { ...base, state: 'rows', distribution, detail: null,
    count: `${capped ? `${waiting.length}+` : waiting.length} waiting` + (handled ? ` · ${handled} handled elsewhere` : '') + ` · ${readText}`,
    preview: `Longest: ${humanise(longest.reasons[0] ?? '')} · ${longest.clientName}` }
}

function group2(a: TodayInputs['anomalies']): TodayGroup {
  const base = { n: 2 as const, name: NAMES[2], open: false as const }
  const scope = `in the last ${a.windowDays} days`
  if (a.groups === null) {
    return { ...base, state: 'readFailed', count: 'could not be read', distribution: [], detail: a.threw || null,
      preview: whyEmpty({ state: 'readFailed', thing: 'the anomaly log', threw: a.threw }).sentence }
  }
  if (a.groups.length === 0) {
    return { ...base, state: 'resting', distribution: [], detail: null, count: `none ${scope}`,
      preview: whyEmpty({ state: 'resting', thing: 'anomalies', scope }).sentence }
  }
  // Most recent, by this group's own clock.
  const newest = a.groups.reduce((x, y) => (Date.parse(y.latest.at) > Date.parse(x.latest.at) ? y : x))
  const critical = a.groups.filter((g) => g.latest.severity === 'critical').length
  const warning = a.groups.length - critical
  return { ...base, state: 'rows', detail: null,
    distribution: [{ label: 'critical', n: critical }, { label: 'warning', n: warning }].filter((d) => d.n),
    count: `${a.groups.length} ${a.groups.length === 1 ? 'fault' : 'faults'} · ${a.capped ? `${a.total}+` : a.total} occurrences ${scope}`,
    preview: `Newest: ${newest.latest.label} · ${newest.count}× ${scope}` }
}

function notBuilt(n: 3 | 4, thing: string, haveWhat: string, when: string): TodayGroup {
  return { n, name: NAMES[n], state: 'notBuilt', open: false, count: 'not built yet', distribution: [], detail: null,
    preview: whyEmpty({ state: 'notBuilt', thing, haveWhat, when }).sentence }
}

export function buildToday(i: TodayInputs): TodayModel {
  const never = i.clientsWithAutomation === 0
    ? 'No client has any automation switched on, so nothing can be waiting on anybody yet. That is not the same as a quiet day.'
    : null
  const groups: TodayGroup[] = [
    group1(i.queue),
    group2(i.anomalies),
    notBuilt(3, 'clearances that have stopped holding, a property we cleared where something has since changed',
      'the lapse logic is written in publication/recheck.ts and cannot run: there is no clearances table and nothing writes one. The documents themselves are on "What is still good"',
      'it needs a clearances table and a writer in the gate'),
    notBuilt(4, 'clearances about to stop holding',
      'the same missing input as group 3. The documents half (certificates past or near their date) is live on "What is still good"',
      'the same table and writer'),
    {
      n: 5, name: NAMES[5], state: 'notDesigned', open: false, distribution: [], detail: null,
      // 🔴 CORRECTED 22 Sep 2026. C4 said "nothing holds these". The gated ledger
      // (lib/gates.ts) now does, and says itself that group 5 is not rendered until
      // it is DESIGNED as the operator's waiting room. A stale "no source" on the
      // landing is the sixth meaning of nothing arriving inside its own fix.
      count: `${i.openGates} open ${i.openGates === 1 ? 'gate' : 'gates'} in the ledger · not designed yet`,
      preview: `The source exists: the gated ledger holds ${i.openGates} open ${i.openGates === 1 ? 'wait' : 'waits'} on somebody outside. The waiting room that shows them is not designed yet.`,
    },
  ]
  const outage = detectOutage((i.queue.rows ?? []).map((r) => ({ at: r.at, reasons: r.reasons })))
  return { never, groups, outage }
}
