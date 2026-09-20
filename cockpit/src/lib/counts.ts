import 'server-only'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EVERY COUNT ON A SCREEN COMES FROM HERE.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * docs/cockpit-build-plan.md §1.1. A count that disagrees with the page it
 * links to is the cheapest possible lie, and it has now appeared three times:
 *
 *   • the Stage B escalations design — the sidebar said 4 beside a page whose
 *     headline said 5;
 *   • the Stage B settings design — a banner said "four changes were refused"
 *     over five refusals;
 *   • and in this repo, before either: `app/queue/page.tsx` passes
 *     `openCount={rows.length}` while every other page passes `getOpenCount()`.
 *
 * THAT THIRD ONE IS NOT A BUG TODAY, WHICH IS THE POINT. `getQueue` and
 * `getOpenCount` happen to apply the same filter with the same limit, so the
 * two numbers agree — by coincidence of two code paths, not by construction.
 * The Stage B escalations design separates handledElsewhere out of "waiting",
 * because a lead somebody already replied to is neither open nor closed. The
 * moment that lands, one path would keep counting it and the other would not,
 * and the badge would over-report on every screen except the queue.
 *
 * So the fix is structural rather than careful: ONE read per request, whose
 * result is handed to the frame and to the page. The navigation never counts
 * anything. It receives a number and renders it.
 *
 * 🔒 The rule this file exists to make unbreakable: if a number appears in two
 * places, those two places call the same function. Not the same query written
 * twice — the same function.
 */

import { getQueue } from './data'

export type Counts = {
  /** Leads waiting for a human. 🔒 Excludes handledElsewhere — see below. */
  waiting: number
  /**
   * Escalated, still flagged, and somebody has already replied outside the
   * cockpit. Neither open nor closed, so it is its own number rather than
   * being folded into `waiting` or silently dropped: folding it in sends the
   * operator to a handled lead, dropping it loses a flag nobody cleared.
   */
  handledElsewhere: number
  /**
   * True when the underlying read hit its cap, so `waiting` is a floor rather
   * than a total. The frame renders `100+`, never a silent 100.
   */
  capped: boolean
  /** When this was read. Every figure computed at a moment says which (§0.4-6). */
  at: string
}

/**
 * What the frame renders when the read threw.
 *
 * 🔒 Not zero. A frame that shows nothing waiting because it could not ask is
 * the failure the escalation queue exists to prevent, wearing the resting
 * state's appearance. `null` makes the caller decide, and the frame renders a
 * dash with the failure beside it.
 */
export type CountsOrUnknown = Counts | null

const QUEUE_LIMIT = 100

/**
 * `clientId` narrows the same read. The operator-level badge and a client's
 * own headline are then the same function with a different argument, which is
 * the whole point — see the note at the top of this file.
 */
export async function readCounts(clientId?: string): Promise<CountsOrUnknown> {
  try {
    const rows = await getQueue(QUEUE_LIMIT, clientId)
    const handledElsewhere = rows.filter((r) => r.handledElsewhere).length
    return {
      waiting: rows.length - handledElsewhere,
      handledElsewhere,
      capped: rows.length >= QUEUE_LIMIT,
      at: new Date().toISOString(),
    }
  } catch {
    // The reason is rendered by the screen that owns the read, from its own
    // thrown sentence (§0.4-5). The frame only needs to know it does not know.
    return null
  }
}

/**
 * The badge text, so the nav and the page headline cannot format the same
 * number differently. `100+` rather than a silent 100 is §0.4-2.
 */
export function badge(counts: CountsOrUnknown): string {
  if (counts === null) return '—'
  if (counts.waiting === 0) return ''
  return counts.capped ? `${counts.waiting}+` : String(counts.waiting)
}

/**
 * The headline the escalations page shows, from the same numbers as the badge.
 * A test asserts the badge and the headline never disagree.
 */
export function headline(counts: CountsOrUnknown): string {
  if (counts === null) return 'The queue could not be read'
  const n = counts.capped ? `${counts.waiting}+` : String(counts.waiting)
  return counts.waiting === 0 ? 'Nobody is waiting' : `${n} waiting`
}
