import { decideGate, type ConsentFacts, type GateVerdict } from '@/lib/gate'
import type { PolicyRow } from '@/lib/jurisdiction-policy'
import { checkPacing, type ContactHistory } from '@/lib/send/pacing'
import { dispositionOf, type CloseRow, type AskRow, type DispositionContext } from './disposition'

/**
 * What would be asked today, and why everything else would not be.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ IT DECIDES AND IT STOPS ONE FUNCTION SHORT OF SENDING.                  │
 * │                                                                         │
 * │ The pattern 04's F4 set: build the decision, hold the act, and let a    │
 * │ source-level test prove the module cannot reach a dispatcher. There is  │
 * │ no `execute`, no adapter, no credential and no store in this file — a   │
 * │ plan comes out and nothing here can carry it anywhere.                  │
 * │                                                                         │
 * │ That is not a staging decision waiting to be undone when Meta           │
 * │ approves. `review-boundary.test.ts` reads this source, so the day       │
 * │ somebody wires a send into it, a test fails with a filename.            │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ⚠️ IT ASKS `dispositionOf` WHAT IS EVEN A CANDIDATE, rather than deciding
 * again.
 * ───────────────────────────────────────────────────────────────────────────
 * The screen and the runner would otherwise hold two definitions of "due", and
 * lesson 15 is about exactly that: a mirror drifts. Worse here than usually,
 * because the two definitions would disagree about WHO GOT ASKED — the screen
 * reporting an omission the runner does not see, or the runner sending to
 * somebody the screen counts as already refused.
 *
 * So: one definition. A close is a candidate if and only if its disposition is
 * `pending` and it has come due.
 */

export type AskCandidate = {
  close: CloseRow
  /** The party's number, as the ledger holds it. */
  phone: string
  consent: ConsentFacts
  policy: PolicyRow | null | undefined
  history: ContactHistory
}

export type Planned =
  | { closeId: string; act: 'ask'; phone: string; basis: string }
  /** Final. The gate said no, and its own words travel unchanged. */
  | { closeId: string; act: 'refuse'; layer: 'gate'; reason: string; detail: string }
  /** Not final. Pacing deferred it; it stays eligible until the window closes. */
  | { closeId: string; act: 'defer'; layer: 'pacing'; reason: string; detail: string }
  /** Not due, or already accounted for by its disposition. */
  | { closeId: string; act: 'skip'; why: string }

export type Plan = {
  planned: Planned[]
  /** Counted for the run record, not for a screen. */
  asks: number
  refusals: number
  deferrals: number
  skipped: number
}

export function planReviewAsks(
  candidates: AskCandidate[],
  asks: AskRow[],
  ctx: DispositionContext & { sentToday: number },
): Plan {
  const now = ctx.now ?? new Date()
  const planned: Planned[] = []

  // The client's day is shared across every automation, and it is spent in the
  // order this loop runs. Counted forward so the cap refuses the same way it
  // would if 02 had sent them.
  let sentToday = ctx.sentToday

  for (const c of candidates) {
    const d = dispositionOf(c.close, asks, ctx)
    if (d.state !== 'pending') {
      planned.push({ closeId: c.close.closeId, act: 'skip', why: `Already ${d.state}.` })
      continue
    }
    if (d.dueOn > isoDay(now)) {
      planned.push({ closeId: c.close.closeId, act: 'skip', why: `Not due until ${d.dueOn}.` })
      continue
    }

    /*
     * ⚠️ THE CONSENT GATE, ON EVERY ONE, AND IT IS NOT OPTIONAL HERE.
     *
     * A review request is a business-initiated message to a person, so it is
     * the same question `decideGate` answers for 02 and 03 — and §2 of the
     * design turns on this call: the people it refuses are exactly why the ask
     * list is shorter than the sales list, and every refusal it returns is
     * about consent, jurisdiction or an objection rather than about what this
     * person would have written.
     */
    const g: GateVerdict = decideGate({
      phone: c.phone, consent: c.consent, policy: c.policy, now,
    })
    if (!g.permitted) {
      planned.push({
        closeId: c.close.closeId, act: 'refuse', layer: 'gate',
        reason: g.reason, detail: g.detail,
      })
      continue
    }

    // Pacing last, because it is the only refusal that is a DEFERRAL: a
    // contact touched this week is eligible again next week, and recording it
    // as final would end an ask that has not run out of window.
    const p = checkPacing({ history: c.history, sentToday, now })
    if (!p.permitted) {
      planned.push({
        closeId: c.close.closeId, act: 'defer', layer: 'pacing',
        reason: p.reason, detail: p.detail,
      })
      continue
    }

    planned.push({ closeId: c.close.closeId, act: 'ask', phone: c.phone, basis: g.basis })
    sentToday += 1
  }

  return {
    planned,
    asks: planned.filter((p) => p.act === 'ask').length,
    refusals: planned.filter((p) => p.act === 'refuse').length,
    deferrals: planned.filter((p) => p.act === 'defer').length,
    skipped: planned.filter((p) => p.act === 'skip').length,
  }
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10)
