import {
  dispositionOf, REASON_MEANS,
  type AskRow, type CloseRow, type DispositionContext, type NotAskedReason,
} from './disposition'

/**
 * Closes against asks. The residue is the finding.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ THIS IS A RECONCILIATION AND NOT AN INVARIANT, AND THE DIFFERENCE IS    │
 * │ THE WHOLE REASON IT EXISTS.                                             │
 * │                                                                         │
 * │ Every other check in this codebase is shaped to STOP something. No send │
 * │ without a ledger row, no publication without a certificate, no match on │
 * │ a sold listing. Refusal is the grammar.                                 │
 * │                                                                         │
 * │ §8.B asks for the opposite — DO NOT FAIL TO ASK SOMEBODY — and there is │
 * │ nothing to stop: the omission has already happened and blocking a send  │
 * │ does not repair it. An invariant has no purchase on a thing that has    │
 * │ already not happened.                                                   │
 * │                                                                         │
 * │ So: two records, account for every row, hand what is left to a person.  │
 * │ `reconcile.ts` already does exactly this against the provider and never │
 * │ re-dispatches. Same posture, different pair.                            │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * IT SENDS NOTHING AND REPAIRS NOTHING. It imports no dispatcher and no store.
 * A reconciliation that could send would be tempted, on finding somebody
 * unasked, to ask them — six weeks late, outside every window, into a quality
 * rating it cannot see. The finding goes to a person.
 */

export type Unaccounted = {
  closeId: string
  listingReference: string | null
  closedOn: string
  /** Why we cannot account for it, in the words the disposition used. */
  detail: string
}

export type ReasonCount = { reason: NotAskedReason; count: number; means: string }

export type OmissionReport =
  | {
      checked: false
      /** Said plainly, because an empty report and an unrun one look identical. */
      why: string
    }
  | {
      checked: true
      closes: number
      asked: number
      pending: number
      /** Every refusal, by reason. The screen shows all of them — §2. */
      notAsked: ReasonCount[]
      notAskedTotal: number
      /** 🔴 The finding. This must always be empty. */
      unaccounted: Unaccounted[]
      /** What this run could not see. On the screen, never in a footnote. */
      limits: string[]
    }

/**
 * ⚠️ WHAT THIS CHECK CANNOT SEE — carried in the return value, not in a comment.
 *
 * Lesson 5k: an empty list reads as "nothing is wrong" when what is true may be
 * "nothing was looked at". Here the limits are permanent rather than conditional,
 * which makes them easier to forget and no less important: a clean report is a
 * statement about our own rows, and presenting it as a statement about the
 * agency's sales would be the system making a claim about the world from a count
 * of its own records.
 */
export const LIMITS: readonly string[] = [
  'This covers sales the agency told us about. It cannot see one they did not report.',
  'It cannot see whether anybody actually wrote a review. We do not read the platform, ' +
    'deliberately — see §11 of the design.',
  'It cannot see whether the agency asked somebody themselves, in person or by hand.',
  'It knows a message reached the provider. It does not know it was read.',
  // The sentence that stops the whole thing being read as a guarantee.
  'So: it proves we did not skip anybody we were TOLD about. It cannot prove the agency did ' +
    'not skip somebody by not telling us.',
]

export function reconcileAsks(
  closes: CloseRow[],
  /**
   * The send rows for these closes.
   *
   * ⚠️ ABSENT AND EMPTY ARE DIFFERENT, as everywhere else since 5k.
   *   undefined  we were not given the sends. Nothing is checked and the report
   *              says so, because "no send rows" would otherwise read as
   *              "nobody was asked" — a page of findings from a missing argument.
   *   []         we were given them and there are none. At the start of an
   *              agency's life that is TRUE, and every close is genuinely
   *              pending or unaccounted.
   */
  asks: AskRow[] | undefined,
  ctx: DispositionContext & {
    /** Per-client, resolved by the caller. Absent means it was not looked up. */
    agencyDisabled?: boolean
    hasReviewDestination?: boolean
  } = {},
): OmissionReport {
  if (!asks) {
    return {
      checked: false,
      why:
        'The sends behind these closes were not read, so nothing was compared. This is not a ' +
        'clean result: an empty list of omissions would mean nothing was looked at rather than ' +
        'nothing was wrong.',
    }
  }

  let asked = 0
  let pending = 0
  const byReason = new Map<NotAskedReason, number>()
  const unaccounted: Unaccounted[] = []

  for (const c of closes) {
    const d = dispositionOf(c, asks, ctx)
    switch (d.state) {
      case 'asked': asked += 1; break
      case 'pending': pending += 1; break
      case 'not_asked':
        byReason.set(d.reason, (byReason.get(d.reason) ?? 0) + 1)
        break
      case 'unaccounted':
        unaccounted.push({
          closeId: c.closeId,
          listingReference: c.listingReference,
          closedOn: c.closedOn,
          detail: d.detail,
        })
        break
    }
  }

  // Oldest first. A sale that closed in March and was never asked has been
  // unasked longer, and is the one to look at before this morning's.
  unaccounted.sort((a, b) => a.closedOn.localeCompare(b.closedOn) || a.closeId.localeCompare(b.closeId))

  // Commonest reason first: it is the one worth a conversation with the agency.
  const notAsked: ReasonCount[] = [...byReason.entries()]
    .map(([reason, count]) => ({ reason, count, means: REASON_MEANS[reason] }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))

  return {
    checked: true,
    closes: closes.length,
    asked,
    pending,
    notAsked,
    notAskedTotal: notAsked.reduce((n, r) => n + r.count, 0),
    unaccounted,
    limits: [...LIMITS],
  }
}

/**
 * The three counts §2 puts side by side, and the arithmetic that explains them.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ "EVERYONE" MEANS EVERYONE WE MAY LAWFULLY MESSAGE.                      │
 * │                                                                         │
 * │ The gate refuses segment D, segment E, suppressed contacts and          │
 * │ unresolvable jurisdictions, so the asked list is ALWAYS shorter than    │
 * │ the closes list. Somebody will read that difference as a bug.           │
 * │                                                                         │
 * │ IT IS NOT A BUG, AND CLOSING IT IS THE OFFENCE. §8.B: pedir a todos é   │
 * │ permitido; escolher a quem pedir não é. The exclusions are never about  │
 * │ sentiment — every one is a rule that applied before anybody could know  │
 * │ what this person would have written.                                    │
 * │                                                                         │
 * │ A discrepancy that is displayed and explained does not get investigated │
 * │ as a defect. That is why this function exists rather than a subtraction │
 * │ at the call site.                                                       │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
export function explainTheGap(r: Extract<OmissionReport, { checked: true }>): {
  closes: number
  asked: number
  difference: number
  /**
   * Is every one of the difference explained by a named reason?
   *
   * ⚠️ This began as `difference === pending + notAsked + unaccounted`, which is
   * TRUE BY CONSTRUCTION — the switch that fills those buckets is exhaustive, so
   * the sum is the difference whatever happens. It was a field that could not be
   * false, asserted by two tests that both expected true, and it would have gone
   * on the screen as reassurance about an arithmetic identity.
   *
   * What a reader actually needs to know is whether anything in the gap has NO
   * explanation, and that is exactly what an unaccounted row is.
   */
  fullyExplained: boolean
  unexplained: number
  lines: { reason: NotAskedReason; count: number; means: string }[]
} {
  return {
    closes: r.closes,
    asked: r.asked,
    difference: r.closes - r.asked,
    fullyExplained: r.unaccounted.length === 0,
    unexplained: r.unaccounted.length,
    lines: r.notAsked,
  }
}
