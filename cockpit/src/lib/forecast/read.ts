import 'server-only'

import { admin } from '@/lib/supabase/admin'
import { GATE_REFUSAL_MEANS } from '@/lib/gate'
import { classifyStaleness, type Staleness, type WorldNow } from '@/lib/contact/staleness'

/*
 * ═════════════════════════════════════════════════════════════════════════════
 * IF WE RAN THE CAMPAIGN NOW, WHO WOULD IT REACH, WHO WOULD IT REFUSE, AND WHY?
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Brief III §4, Q16.
 *
 * 🔒 THE REFUSAL BREAKDOWN IS THE SCREEN, not a footnote under a headline. A
 * campaign of 300 that refuses 280 is the NORMAL case, and the 280 is the part
 * with work in it. The screen must not apologise for its own output.
 *
 * 🔒 OPERATOR WORDS, NEVER MACHINE REASONS — and they come from
 * `GATE_REFUSAL_MEANS`, which the gate itself uses. An operator who reads
 * "Portugal is not confirmed by a lawyer" chases the lawyer; one who reads
 * `not_confirmed` files a bug.
 */

export type RefusalGroup = {
  reason: string
  /** The gate's own sentence for this reason. */
  means: string
  count: number
  /** §4.1 — whether this particular reason has gone stale since evaluation. */
  staleness: Staleness
}

export type Forecast = {
  runId: string
  status: string
  automation: string
  targetCount: number
  excludedCount: number
  excludedBreakdown: Record<string, number>
  forecastPermitted: number
  forecastRefused: number
  refusals: RefusalGroup[]
  haltedReason: string | null
  /** Null when the run never reached evaluation. */
  evaluatedAt: string | null
  sentCount: number
  refusedLateCount: number
  failedCount: number
  ambiguousCount: number
  /** 🔒 True when ANY refusal reason is older than an input it depended on. */
  anyStale: boolean
  at: string
}

/** Null = the read failed. `'never'` = this client has never been evaluated. */
export type ForecastOrUnknown = Forecast | null | 'never'

async function worldNow(clientId: string): Promise<WorldNow> {
  try {
    const db = admin()
    const [advertising, jurisdiction, consent] = await Promise.all([
      db.from('advertising_policy').select('confirmed_at'),
      db.from('jurisdiction_policy').select('confirmed_at'),
      db
        .from('consent_events')
        .select('recorded_at')
        .eq('client_id', clientId)
        .order('recorded_at', { ascending: false })
        .limit(1),
    ])
    if (advertising.error || jurisdiction.error || consent.error) throw new Error('world read failed')
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

export async function readForecast(clientId: string): Promise<ForecastOrUnknown> {
  try {
    const db = admin()
    const { data, error } = await db
      .from('campaign_runs')
      .select('id, status, automation, target_count, excluded_count, excluded_breakdown, forecast_permitted, forecast_refused, refusal_breakdown, halted_reason, evaluated_at, sent_count, refused_late_count, failed_count, ambiguous_count')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)
    if (error) throw error

    const row = data?.[0]
    // 🔒 'never' is not null and not an empty forecast. S2: this client has
    // never been evaluated, which is today's state and is not a failure.
    if (!row) return 'never'

    const world = await worldNow(clientId)
    const breakdown = (row.refusal_breakdown ?? {}) as Record<string, number>

    /*
     * §4.1, and it is the state this screen was designed around.
     *
     * Opened a month later this view says "41 refused — Portugal is not
     * confirmed by a lawyer" about a Portugal confirmed three weeks ago.
     * Everything on it is true about the evaluation date and false about
     * today, and nothing in a layout says which of the two it describes.
     *
     * 🔒 Asked PER REASON through the same `classifyStaleness` the contact
     * record uses, so "is this refusal stale" has one answer in the cockpit.
     * A second implementation here would drift, and the two screens would
     * disagree about the same refusal.
     */
    const refusals: RefusalGroup[] = Object.entries(breakdown)
      .map(([reason, count]) => ({
        reason,
        means: GATE_REFUSAL_MEANS[reason] ?? `No operator wording exists for "${reason}" yet.`,
        count: Number(count) || 0,
        staleness: row.evaluated_at
          ? classifyStaleness({ decidedAt: row.evaluated_at, layer: null, reason, country: null }, world)
          : ({ state: 'current' } as Staleness),
      }))
      // 🔒 Largest first. The biggest refusal group is the one with the most
      // work in it, and the screen's whole argument is that it is the content.
      .sort((a, b) => b.count - a.count)

    return {
      runId: row.id,
      status: row.status,
      automation: row.automation,
      targetCount: row.target_count,
      excludedCount: row.excluded_count,
      excludedBreakdown: (row.excluded_breakdown ?? {}) as Record<string, number>,
      forecastPermitted: row.forecast_permitted,
      forecastRefused: row.forecast_refused,
      refusals,
      haltedReason: row.halted_reason,
      evaluatedAt: row.evaluated_at,
      sentCount: row.sent_count,
      refusedLateCount: row.refused_late_count,
      failedCount: row.failed_count,
      ambiguousCount: row.ambiguous_count,
      anyStale: refusals.some((r) => r.staleness.state === 'cause_gone' || r.staleness.state === 'moved'),
      at: new Date().toISOString(),
    }
  } catch {
    return null
  }
}

/**
 * 🔴 THE SPLIT THE BRIEF REQUIRES AND THE DATA CANNOT EXPRESS.
 *
 * Brief III §4: *"Make the largest refusal the most legible, and split it.
 * 'Nothing recorded about them' contains two different things: contacts nobody
 * has said anything about, and contacts carrying a claim the agency could still
 * evidence. The second is a worklist; the first is not."*
 *
 * The gate DOES distinguish them — `gate.ts` returns a different `detail` for
 * `claimed_unevidenced` than for `undetermined`. But `evaluate.ts:133` keys the
 * breakdown as `refusalBreakdown[verdict.reason]`, and BOTH have the reason
 * `no_ledger_basis`. The split is present on every individual `sends` row and
 * absent from the aggregate the screen reads.
 *
 * 🔒 NOT RECOVERED BY MATCHING THE PROSE. The two details differ only in
 * wording, and a screen that counted contacts by string-matching a sentence
 * would break the first time somebody improved it — and would do so silently,
 * reporting a worklist of zero rather than an error.
 *
 * So the screen says the split is unavailable and names what would fix it. This
 * is the honest version of §0.4-10: a figure derived over a set says what was
 * examined, or says nothing was.
 */
export const BASIS_SPLIT_UNAVAILABLE = {
  reason: 'no_ledger_basis',
  why: 'The forecast records refusals by reason, and both halves of this group share the reason `no_ledger_basis`. The gate tells them apart in each send row’s own sentence, but the aggregate this screen reads does not carry it.',
  whatWouldFix:
    'evaluate.ts keys the breakdown on verdict.reason alone. Carrying the basis kind alongside it — claimed-but-unevidenced against nothing-ever-recorded — would make the worklist half countable without reading prose.',
  whyItMatters:
    'One half is a worklist: the agency asserted something they could still evidence, and asking them may convert it. The other half is not — nobody has ever said anything about those contacts, and there is nothing to ask for.',
}
