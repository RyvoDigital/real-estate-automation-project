import 'server-only'
import { cache } from 'react'
import { admin } from '@/lib/supabase/admin'
import { gateClientIds } from '@/lib/gate-clients'

/**
 * WHO IS NOT THE BUSINESS, on an operator-wide screen (22 Sep 2026).
 *
 * Two flags, one rule. Both are DECLARED, and neither is a name:
 *   - `clients.rehearsal = true` — answered at onboarding (0037). A rehearsal is
 *     real work on real rows; it is simply not this business's work.
 *   - `client_automations.config.gate_only` — the deploy gate's client, marked
 *     by the gate scripts. Already excluded from the queue, the counts, the
 *     leads and the anomalies since the morning of 22 Sep, when 78 of its
 *     escalations appeared in the operator's queue and the wrong lead was
 *     handed back.
 *
 *   🔒 BY THE FLAG, NEVER BY NAME. A screen that hides "ZZ GATE" hides nothing
 *      the day somebody renames it, and hides a real agency that happens to be
 *      called something similar.
 *   🔴 `rehearsal IS NULL` IS NOT HIDDEN. Null means nobody answered the
 *      question (0038 is still blocked, so the column is nullable). Hiding on
 *      it would hide a real agency's waiting lead because of a blank in our own
 *      record — a fallback asserting something, which is lesson 13. The Month
 *      may treat null as not-real because it is counting money it must not
 *      overstate; a queue must not lose people that way.
 *   🔒 A FAILED READ HIDES NOTHING, and says so. Hiding on a failed read would
 *      empty the operator's screens during an outage and call it a quiet day.
 */
export type Hidden = {
  /** client ids to leave out of an operator-wide read */
  ids: string[]
  /** how many rehearsal clients are being left out (0 when they are included) */
  rehearsals: number
  /** how many deploy-gate clients are being left out */
  gate: number
  /** 🔴 the flags could not be read, so NOTHING is hidden and the screen says so */
  failed: boolean
  /** what this read was ASKED for, so a control can show its own state */
  includingRehearsals: boolean
}

export const NONE_HIDDEN: Hidden = { ids: [], rehearsals: 0, gate: 0, failed: false, includingRehearsals: false }

export const hiddenClients = cache(async (includeRehearsals = false): Promise<Hidden> => {
  const [gate, rows] = await Promise.all([
    gateClientIds(),
    admin().from('clients').select('id, rehearsal').then(
      (r) => (r.error ? null : ((r.data ?? []) as { id: string; rehearsal: boolean | null }[])),
      () => null,
    ),
  ])

  if (rows === null) {
    // The gate's own list still applies: it was read, and it is the older rule.
    return { ids: gate, rehearsals: 0, gate: gate.length, failed: true, includingRehearsals: includeRehearsals }
  }

  const rehearsalIds = rows.filter((c) => c.rehearsal === true).map((c) => c.id)
  const hide = new Set(gate)
  if (!includeRehearsals) for (const id of rehearsalIds) hide.add(id)

  return {
    ids: [...hide],
    // Counted as "not shown here", so a gate client that is also a rehearsal
    // is named once, by the more specific flag.
    rehearsals: includeRehearsals ? 0 : rehearsalIds.filter((id) => !gate.includes(id)).length,
    gate: gate.length,
    failed: false,
    includingRehearsals: includeRehearsals,
  }
})

/**
 * The line an operator-wide group prints when something is being left out.
 * Null when nothing is — a screen does not say "0 hidden".
 */
export function hiddenLine(h: Hidden): string | null {
  if (h.failed) return 'Whether any client is a rehearsal could not be read, so nothing is hidden here and these figures may include rehearsals.'
  const parts = [
    h.rehearsals ? `${h.rehearsals} rehearsal client${h.rehearsals === 1 ? '' : 's'}` : null,
    h.gate ? 'the deploy gate’s client' : null,
  ].filter(Boolean)
  if (parts.length === 0) return null
  return `Not counted here: ${parts.join(' and ')}.`
}
