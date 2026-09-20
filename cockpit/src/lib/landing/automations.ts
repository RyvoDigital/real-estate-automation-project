import 'server-only'

import { admin } from '@/lib/supabase/admin'
import { gatesHoldingAutomation, type AutomationKey } from '@/lib/gates'
import { automationState, type AutomationFacts, type AutomationStatus } from '@/lib/automation-state'

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT EACH OF THIS CLIENT'S AUTOMATIONS IS DOING — the clocks strip's source.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Brief III §1. The strip is what makes the S1 landing legible: a page saying
 * nothing is notable is indistinguishable from a page that could not look,
 * unless the clocks are still there saying when each automation last ran.
 *
 * 🔴 IT NEVER READS `client_automations.health` OR `.last_run_at`.
 *
 * THE COLUMNS ARE GONE. `0036` dropped them on 19 September 2026, having first
 * proved them empty, because nothing had ever written to either: `health` read
 * 'unknown' for every row from its own default, and `last_run_at` was null for
 * every row. A column nobody writes is a fallback asserting that nobody has
 * checked (§13).
 *
 * So the hazard changed shape when 0036 landed, and this guard is worth MORE
 * now rather than less:
 *
 *   before 0036   selecting them SUCCEEDED and rendered "unknown" and "never"
 *                 for an automation that had run a thousand times — a
 *                 not-checked (S3) wearing a never-happened (S2) sentence
 *   after 0036    selecting them THROWS, and PostgREST fails the whole query,
 *                 so one dropped column name takes the entire clocks strip to
 *                 S4 and the landing stops being able to say anything
 *
 * 🔴 AND THE DESIGN BRIEF STILL SAYS THE DROP IS OWED. Brief III §1 reads
 * "0035's sibling drop is owed", which was true when it was written and stopped
 * being true the same week. This file was first written from that sentence.
 * The handover — which CLAUDE.md says to read first — had it right. Lesson 8:
 * every defect was a belief that had stopped being true.
 *
 * The truth is in `automation_runs`, which is written on every execution, so
 * the last run is `max(started_at)` over the runs. A test asserts the two names
 * do not appear in this file's select strings — the defect is not reading them
 * wrongly, it is naming them at all.
 */

/** How far back an errored run still counts as something to fix. */
export const RUN_ERROR_WINDOW_DAYS = Number(process.env.RUN_ERROR_WINDOW_DAYS ?? 7)

export type LastRun = {
  at: string
  /** As the row holds it: success | error | running. Not interpreted here. */
  status: string
  errorType: string | null
  errorMessage: string | null
}

export type AutomationRead = {
  key: AutomationKey
  /** `automations.name` — trustworthy since 0035 was applied on 19 September. */
  name: string
  status: AutomationStatus
  /** Null means it has never run. Never means "we did not look" — that is a null read. */
  lastRun: LastRun | null
  /** Errored runs inside the window. Band 1 — ours to fix. */
  erroredRecently: number
}

/**
 * 🔒 Null is not an empty list.
 *
 * An empty list means this client has no automations configured. Null means
 * the read threw, and the strip must say S4 rather than draw five never-runs —
 * which would be the screen inventing the most alarming possible answer out of
 * its own failure.
 */
export type AutomationsOrUnknown = AutomationRead[] | null

/** The order the strip renders in: the order the automations were seeded. */
const ORDER: AutomationKey[] = [
  'inbound_concierge',
  'db_reactivation',
  'lead_nurture',
  'listing_launch',
  'reputation_loop',
]

/**
 * What is holding this automation, asked of the ledger and never worked out
 * here. `gates.ts` is the only thing that knows.
 *
 * The href is the landing's own third band rather than a waiting room, because
 * the waiting room is not built — and a link to a screen that does not exist
 * is worse than a link to the paragraph three inches below, which at least
 * says the true thing.
 */
function heldBy(key: AutomationKey): { what: string; href: string } | null {
  const holding = gatesHoldingAutomation(key)
  if (holding.length === 0) return null
  const [first] = holding
  const more = holding.length - 1
  return {
    what: more > 0 ? `${first.gate.what} (and ${more} other)` : first.gate.what,
    href: '#nobodys-yet',
  }
}

export async function readAutomations(clientId: string): Promise<AutomationsOrUnknown> {
  try {
    const db = admin()

    // 🔴 The select names every column it wants. `client_automations.health`
    // and `.last_run_at` are absent by construction, not by filtering later.
    const [defs, mine] = await Promise.all([
      db.from('automations').select('id,key,name'),
      db.from('client_automations').select('id,automation_id,enabled,config').eq('client_id', clientId),
    ])
    if (defs.error) throw defs.error
    if (mine.error) throw mine.error

    const rows = mine.data ?? []
    const runsBy = new Map<string, LastRun>()
    const erroredBy = new Map<string, number>()

    if (rows.length > 0) {
      const since = new Date(Date.now() - RUN_ERROR_WINDOW_DAYS * 86_400_000).toISOString()
      const ids = rows.map((r) => r.id)

      const [latest, errored] = await Promise.all([
        db
          .from('automation_runs')
          .select('client_automation_id,status,started_at,error_type,error_message')
          .in('client_automation_id', ids)
          .order('started_at', { ascending: false })
          .limit(500),
        db
          .from('automation_runs')
          .select('client_automation_id')
          .in('client_automation_id', ids)
          .eq('status', 'error')
          .gte('started_at', since)
          .limit(500),
      ])
      if (latest.error) throw latest.error
      if (errored.error) throw errored.error

      // Ordered newest-first, so the first sighting of each id is its last run.
      for (const r of latest.data ?? []) {
        if (runsBy.has(r.client_automation_id)) continue
        runsBy.set(r.client_automation_id, {
          at: r.started_at,
          status: r.status,
          errorType: r.error_type ?? null,
          errorMessage: r.error_message ?? null,
        })
      }
      for (const r of errored.data ?? []) {
        erroredBy.set(r.client_automation_id, (erroredBy.get(r.client_automation_id) ?? 0) + 1)
      }
    }

    const byAutomationId = new Map(rows.map((r) => [r.automation_id, r]))

    return ORDER.flatMap((key) => {
      const def = (defs.data ?? []).find((d) => d.key === key)
      // An automation the database does not define is not rendered at all. It
      // is not this client's business that a seed row is missing.
      if (!def) return []
      const row = byAutomationId.get(def.id)
      const lastRun = row ? (runsBy.get(row.id) ?? null) : null

      const facts: AutomationFacts = {
        enabled: row?.enabled ?? false,
        everRan: lastRun !== null,
        // 🔒 No row at all is not "off". Off is a decision somebody took; this
        // is an automation nobody ever set up for this client, and saying
        // "off" would claim a switch that does not exist (§0.4-8).
        missing: row ? [] : ['this automation has never been set up for this client'],
        heldBy: heldBy(key),
      }

      return [
        {
          key,
          name: def.name,
          status: automationState(facts),
          lastRun,
          erroredRecently: row ? (erroredBy.get(row.id) ?? 0) : 0,
        },
      ]
    })
  } catch {
    // 🔒 Swallowed here and said on the page. The caller distinguishes null
    // from [] and renders S4; returning [] would turn a failed read into a
    // confident "this client has no automations".
    return null
  }
}
