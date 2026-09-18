/**
 * What happened to one close — derived, never stored.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ EVERY CLOSE RESOLVES TO EXACTLY ONE OF FOUR STATES, AND ONE OF THEM     │
 * │ MUST ALWAYS BE EMPTY.                                                   │
 * │                                                                         │
 * │   pending      not yet due, or due and still inside the window          │
 * │   asked        A SEND ROW EXISTS, with a provider message id            │
 * │   not_asked    with a reason, from the closed list below                │
 * │   unaccounted  none of the above. THIS IS THE FINDING                   │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DERIVED FROM THE ARTEFACT, NEVER FROM A STORED FLAG
 * ───────────────────────────────────────────────────────────────────────────
 * Rule 13. A stored `asked = true` is a claim about a code path, and this
 * codebase has eighteen recorded instances of something reporting success while
 * the underlying thing failed. `asked` here requires a provider message id — a
 * fact from the wire — and a send row claiming `sent` without one is
 * `unaccounted`, not asked.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ⚠️ THE REASON VOCABULARY IS CLOSED AND NO MEMBER CAN EXPRESS A JUDGEMENT
 * ───────────────────────────────────────────────────────────────────────────
 * §8.B: *pedir a todos é permitido; escolher a quem pedir não é.* Review gating
 * — asking only the satisfied — is an offence detected automatically and
 * penalised on the client's own business.
 *
 * This is the one place in the system where the tempting act is the KIND one:
 * sparing the unhappy client the request is what a decent person would do by
 * hand, and it is the violation.
 *
 * So there is deliberately no value here meaning "we chose not to ask this
 * one". Every member below is either a fact about the record (nobody was
 * named), a refusal somebody else already wrote (the gate), or a clock. To skip
 * somebody on sentiment you would have to ADD a member.
 *
 * ⚠️ AND BE EXACT ABOUT WHAT STOPS THAT, because it is not a CHECK constraint:
 * the disposition is DERIVED and never stored, so no constraint ever sees it.
 * What stops it is this union being closed and `review-disposition.test.ts`
 * asserting how many members it has — a seventh reason, however innocently
 * named, fails a test whose message tells you to come and write down what it is
 * for. Weaker than a database constraint, stronger than a comment, and claiming
 * the constraint we do not have would be the kind of overstatement this file
 * exists to refuse.
 *
 * The same technique as `0025`'s outcome vocabulary: the words available decide
 * what can be recorded.
 */

export type NotAskedReason =
  | 'party_not_named'
  | 'gate_refused'
  | 'window_expired'
  | 'reported_after_window'
  | 'send_failed'
  | 'agency_disabled'
  | 'no_review_destination'

export const REASON_MEANS: Record<NotAskedReason, string> = {
  party_not_named:
    'The agency reported this sale and has not said which party to ask. We asked and have no ' +
    'answer. Nothing is sent, because the system proposes nothing about a person it was not told ' +
    'about — and this is recorded rather than left blank, so honest silence cannot be mistaken ' +
    'for a fault.',
  gate_refused:
    'The consent gate refused this contact, and its own reason travels with this one unchanged. ' +
    'The refusal is never about the person’s opinion of the agency: it is consent, ' +
    'jurisdiction or an objection, and every one of those is a rule that applies before anybody ' +
    'knows what they would have written.',
  window_expired:
    'This could not be sent inside the window, so it is not sent at all. An ask three weeks after ' +
    'completion reads as a mailing rather than a follow-up, and a late ask is more likely to ' +
    'produce a perfunctory review than a useful one.',
  reported_after_window:
    'We were told about this sale after its own window had already closed, so there was never a ' +
    'moment at which it could have been asked. This is what a backfill of historical sales ' +
    'produces, and it is deliberately NOT the same finding as a close we were told about in time ' +
    'and did nothing with — collapsing the two would let one genuine omission hide among two ' +
    'hundred rows that were never ours to act on.',
  send_failed:
    'The message was attempted and did not arrive. It is not retried: there is no idempotency on ' +
    'message creation, so a second attempt is a coin flip on sending the same person two review ' +
    'requests, and one ask is the rule.',
  agency_disabled:
    'This agency has the review request switched off entirely. That is theirs to decide. What ' +
    'they may not do is switch it off for one sale, which is why no such control exists.',
  no_review_destination:
    'No review link is recorded for this agency, so there is nowhere to send anybody. This is not ' +
    'a degraded mode — an agency with no public profile cannot run this automation at all.',
}

/** A close, as the reconciliation reads it. */
export type CloseRow = {
  closeId: string
  clientId: string
  listingReference: string | null
  /** Null until the agency says who. */
  partyLeadId: string | null
  /** When the agency named the party. Null while `partyLeadId` is null. */
  partyDeclaredAt: string | null
  /** When the agency told us. Distinct from `closedOn`, and the difference matters. */
  reportedAt: string
  /** When we asked the agency who. Null means we have not asked. */
  agentAskedWhoAt: string | null
  /** The legal date of the transaction. Every window is measured from here. */
  closedOn: string
}

/**
 * A send row for one close — sent, refused, or neither.
 *
 * `layer` matters more than it looks: a PACING refusal is a deferral and a GATE
 * refusal is final. Collapsing them would report a contact who was merely
 * touched this week as permanently refused, and would hide the case where a
 * close ran out of window while the runner kept politely deferring it.
 */
export type AskRow = {
  closeId: string
  status: 'intended' | 'sent' | 'failed' | 'refused'
  layer: 'gate' | 'pacing' | null
  reason: string | null
  detail: string | null
  providerMessageId: string | null
  sentAt: string | null
  error: string | null
  intentRecordedAt: string
}

export type Disposition =
  | { state: 'pending'; dueOn: string; expiresOn: string }
  | { state: 'asked'; sentAt: string; providerMessageId: string }
  | { state: 'not_asked'; reason: NotAskedReason; detail: string }
  | { state: 'unaccounted'; detail: string }

/**
 * Three days after the close.
 *
 * Too soon and the transaction is not finished in the client's mind — the deed
 * is signed, the keys are not handed over, and a review of an incomplete
 * experience helps nobody. Too late and it reads as a mailing.
 *
 * A judgement, and stated as one, but not the kind §4.6 refuses to default: it
 * decides how promptly somebody is asked a question they may ignore. It reaches
 * nobody who has not consented and publishes nothing. Different blast radius
 * from a matching threshold, different treatment.
 */
export const ASK_AFTER_DAYS = 3

/**
 * Fourteen days, and then never.
 *
 * Pacing can defer an ask — a contact touched by 02 this week cannot be touched
 * again, and the daily cap is thirty. Deferral is correct. INDEFINITE deferral
 * is not, because an ask three weeks after completion is worse than none.
 *
 * ⚠️ AND IT IS MEASURED FROM `closedOn`, NEVER FROM `reportedAt`. That is the
 * whole of the backfill defence: a close reported today for a sale six months
 * ago is born expired and sends nothing. §6.1 needs no constraint of its own
 * because this number already enforces it.
 */
export const ASK_WINDOW_DAYS = 14

/** An intent younger than this is in flight, not lost. Matches reconcile.ts. */
export const INTENT_GRACE_MS = 10 * 60 * 1000

const DAY = 86_400_000

const addDays = (date: string, n: number): string =>
  new Date(new Date(`${date}T00:00:00Z`).getTime() + n * DAY).toISOString().slice(0, 10)

/** True once `now` is at or past the start of `date`. */
const reached = (date: string, now: Date): boolean =>
  now.getTime() >= new Date(`${date}T00:00:00Z`).getTime()

/**
 * Past the END of `date`, matching every other date in this system.
 *
 * The publication gate treats a certificate as valid through the day it
 * expires, and the re-check had to be corrected to agree with it. Three parts
 * of one feature disagreeing by a day is how a close the runner still considers
 * eligible is reported as expired.
 */
const pastEndOf = (date: string, now: Date): boolean =>
  now.getTime() >= new Date(`${date}T00:00:00Z`).getTime() + DAY

export type DispositionContext = {
  now?: Date
  askAfterDays?: number
  windowDays?: number
  /** This agency has Automation 05 switched off entirely. Never per-sale. */
  agencyDisabled?: boolean
  /** A review link is recorded for this agency. */
  hasReviewDestination?: boolean
}

export function dispositionOf(
  close: CloseRow,
  asks: AskRow[],
  ctx: DispositionContext = {},
): Disposition {
  const now = ctx.now ?? new Date()
  const dueOn = addDays(close.closedOn, ctx.askAfterDays ?? ASK_AFTER_DAYS)
  const expiresOn = addDays(close.closedOn, ctx.windowDays ?? ASK_WINDOW_DAYS)
  const mine = asks.filter((a) => a.closeId === close.closeId)

  // --- 1. the artefact, before anything that could merely claim it ----------
  const sent = mine.find((a) => a.status === 'sent')
  if (sent) {
    if (!sent.providerMessageId || !sent.sentAt) {
      return {
        state: 'unaccounted',
        detail:
          'A send row says this was sent and carries no provider message id. That is a claim ' +
          'about a code path with no fact from the wire behind it, and it is exactly the shape ' +
          'this check exists to refuse to believe.',
      }
    }
    return { state: 'asked', sentAt: sent.sentAt, providerMessageId: sent.providerMessageId }
  }

  const failed = mine.find((a) => a.status === 'failed')
  if (failed) {
    return no('send_failed', failed.error ?? 'No error was recorded for it.')
  }

  // --- 2. an intent with no outcome ----------------------------------------
  const intended = mine.find((a) => a.status === 'intended')
  if (intended) {
    const age = now.getTime() - new Date(intended.intentRecordedAt).getTime()
    if (age > INTENT_GRACE_MS) {
      return {
        state: 'unaccounted',
        detail:
          'An ask was recorded as intended and never resolved to a message or a failure. ' +
          'Reconciliation owns that row; it is surfaced here because from this close’s side ' +
          'nobody can say whether the person was asked.',
      }
    }
    return { state: 'pending', dueOn, expiresOn }
  }

  // --- 3. a refusal somebody else already wrote ----------------------------
  // GATE refusals are final. PACING refusals are deferrals and fall through to
  // the clock below, which is the only thing that can make them permanent.
  const refusedByGate = mine.find((a) => a.status === 'refused' && a.layer === 'gate')
  if (refusedByGate) {
    return no('gate_refused',
      `${refusedByGate.reason ?? 'unknown'}: ${refusedByGate.detail ?? 'no detail was recorded'}`)
  }

  // --- 4. states of the agency, which outrank the clock --------------------
  // An agency with 05 switched off did not run out of time; it is not running.
  if (ctx.agencyDisabled) return no('agency_disabled', '')
  if (ctx.hasReviewDestination === false) return no('no_review_destination', '')

  // --- 5. the party -------------------------------------------------------
  if (!close.partyLeadId) {
    // ⚠️ ASKED AND UNANSWERED IS A DISPOSITION. NEVER ASKED IS OUR OWN GAP.
    //
    // Collapsing these would let the intake silently fail to prompt the agent
    // and have it read as the agent's silence — the check reporting a clean
    // result about the exact failure it exists to catch.
    if (close.agentAskedWhoAt) {
      return no('party_not_named',
        `The agency was asked on ${close.agentAskedWhoAt.slice(0, 10)}.`)
    }
    if (reached(dueOn, now)) {
      return {
        state: 'unaccounted',
        detail:
          'This close is due and nobody has asked the agency which party to ask. The silence is ' +
          'ours, not theirs, and it must not be recorded as theirs.',
      }
    }
    return { state: 'pending', dueOn, expiresOn }
  }

  // --- 6. the clock -------------------------------------------------------
  if (pastEndOf(expiresOn, now)) {
    /*
     * ⚠️ THE EXPIRED BRANCH IS THREE DIFFERENT FACTS, AND ONLY THE LAST IS A
     * FINDING. Written as one, the check drowns: a backfill of two hundred
     * historical sales would produce two hundred `unaccounted` rows, and a
     * genuine omission would sit among them indistinguishable.
     */
    // We were told too late to have acted. Never ours to act on.
    if (pastEndOf(expiresOn, new Date(close.reportedAt))) {
      return no('reported_after_window',
        `Sold on ${close.closedOn}; reported on ${close.reportedAt.slice(0, 10)}.`)
    }
    // The agency named the party after the window closed. They answered; late.
    if (close.partyDeclaredAt && pastEndOf(expiresOn, new Date(close.partyDeclaredAt))) {
      return no('window_expired',
        `The party was named on ${close.partyDeclaredAt.slice(0, 10)}, after the window closed.`)
    }
    // Deferred by pacing until it ran out of window: a real reason, recorded.
    if (mine.some((a) => a.status === 'refused' && a.layer === 'pacing')) {
      return no('window_expired', `Deferred ${mine.length} time(s) and the window closed.`)
    }
    // ⚠️ THE CASE THE WHOLE CHECK EXISTS FOR. Everything was in place, the
    // window passed, and there is no record of anything having been attempted.
    // Nobody refused this person — nobody reached them.
    return {
      state: 'unaccounted',
      detail:
        'This person closed, could have been asked, and the window passed with no ask and no ' +
        'refusal on the record. Nothing declined to send it; nothing tried.',
    }
  }

  if (!reached(dueOn, now)) return { state: 'pending', dueOn, expiresOn }

  // Due, inside the window, nothing attempted yet. The runner has not got to it.
  return { state: 'pending', dueOn, expiresOn }
}

function no(reason: NotAskedReason, extra: string): Disposition {
  return {
    state: 'not_asked',
    reason,
    detail: `${REASON_MEANS[reason]}${extra ? ` ${extra}` : ''}`,
  }
}
