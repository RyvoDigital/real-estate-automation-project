/*
 * ═════════════════════════════════════════════════════════════════════════════
 * A REFUSAL IS A FACT ABOUT A PAST MOMENT.
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Brief II §1.4.1, and the single most important rendering rule on the contact
 * record.
 *
 * *"Refused 22 Sep — Portugal is not confirmed by a lawyer"* is TRUE about
 * 22 September and FALSE about a Portugal confirmed on the 20th. A screen that
 * prints the stored sentence with no age beside it is asserting today what was
 * only ever true then.
 *
 * 🔒 AND IT DOES NOT SILENTLY RE-DECIDE. The screen says *this refusal is
 * stale*. It never recomputes the gate and shows today's answer in the row's
 * place, because the row is the record of a decision that was actually taken,
 * and overwriting it with a better one destroys the only evidence of what we
 * did. This screen is the Article 15 answer (§1.11); an audit trail that
 * improves itself is not one.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 THE DISTINCTION THIS MODULE EXISTS TO HOLD
 * ─────────────────────────────────────────────────────────────────────────────
 * Two claims that look alike and are not:
 *
 *   SOMETHING MOVED     an input this decision depended on is newer than the
 *                       decision. We do not know what today's answer would be.
 *   THE CITED CAUSE IS  the specific thing the refusal NAMED has since been
 *   GONE                resolved. This refusal, as written, could not fire now.
 *
 * Only the second may say "would not happen today", and only when the newer
 * input is the very one the refusal cited. Treating any newer input as the
 * second is the screen re-deciding the gate with a worse model of it than the
 * gate has — guessing an outcome and printing it as a fact (§5j).
 */

/** The refusal fields this reasoning needs. A subset of a `sends` row. */
export type RefusedSend = {
  decidedAt: string
  /** reserved · resolution · suppression · basis · policy · pacing */
  layer: string | null
  /** The machine reason, e.g. `policy_not_confirmed`. Never shown alone. */
  reason: string | null
  /** ISO-3166 alpha-2, as frozen on the row. */
  country: string | null
}

/**
 * What the world says NOW about the things a refusal could have depended on.
 *
 * 🔒 Every field is nullable and null means NOT KNOWN, never "not confirmed".
 * A failed read of `advertising_policy` must not make every policy refusal
 * look current — that would be a not-checked wearing a nothing-changed
 * sentence, which is §0.4-10 on the one screen that answers a legal request.
 */
export type WorldNow = {
  /** `jurisdiction_policy.confirmed_at` for the row's country. */
  jurisdictionConfirmedAt?: string | null
  /** `advertising_policy.confirmed_at` for the row's country. */
  advertisingConfirmedAt?: string | null
  /** The newest `consent_events.recorded_at` for this contact. */
  latestConsentAt?: string | null
  /** False when a read failed, so the answer says "not checked" rather than "current". */
  checked: boolean
}

export type Staleness =
  | { state: 'current' }
  /** An input moved. We do not claim to know today's answer. */
  | { state: 'moved'; sentence: string; movers: string[] }
  /** The refusal named a cause that has since been resolved. */
  | { state: 'cause_gone'; sentence: string; movers: string[] }
  /** A pacing refusal — time-bound by design, never stale. */
  | { state: 'lapses'; sentence: string }
  | { state: 'notChecked'; sentence: string }

/**
 * Reasons whose cited cause is a confirmation we can check directly.
 *
 * 🔒 NAMED, not pattern-matched. A refusal reason we have not thought about
 * falls through to `moved`, which says an input is newer without claiming the
 * outcome — the safe direction. Matching on `/not_confirmed/` would sweep in
 * reasons that merely look alike and start asserting things about them.
 */
const CAUSE_IS_A_CONFIRMATION: Record<string, 'jurisdiction' | 'advertising'> = {
  policy_not_confirmed: 'advertising',
  not_confirmed: 'jurisdiction',
  jurisdiction_not_confirmed: 'jurisdiction',
}

const when = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export function classifyStaleness(send: RefusedSend, now: WorldNow): Staleness {
  /*
   * 🔴 Pacing first, because it is the one refusal that is SUPPOSED to expire.
   *
   * `lib/send/runner.ts` refuses on pacing before the gate is asked:
   * touched_this_week, max_touches_reached. The contact is not refused — the
   * day is. It lapses by its own window rather than by a newer input, so
   * calling it stale would invite somebody to chase a confirmation that has
   * nothing to do with it.
   */
  if (send.layer === 'pacing') {
    return {
      state: 'lapses',
      sentence:
        'This is a refusal about timing, not about this person. It lapses on its own window — nothing needs to be ' +
        'confirmed for a later run to reach a different answer.',
    }
  }

  if (!now.checked) {
    return {
      state: 'notChecked',
      sentence:
        'We have not checked whether anything has changed since this decision: the confirmations could not be read. ' +
        'This is not that the refusal still stands — it is that we do not know.',
    }
  }

  const decided = Date.parse(send.decidedAt)
  const movers: string[] = []
  const newer = (iso: string | null | undefined) => (iso ? Date.parse(iso) > decided : false)

  const citedKind = send.reason ? CAUSE_IS_A_CONFIRMATION[send.reason] : undefined
  const citedMoved =
    (citedKind === 'advertising' && newer(now.advertisingConfirmedAt)) ||
    (citedKind === 'jurisdiction' && newer(now.jurisdictionConfirmedAt))

  if (newer(now.advertisingConfirmedAt)) {
    movers.push(`${send.country ?? 'this country'}'s advertising policy was confirmed on ${when(now.advertisingConfirmedAt!)}`)
  }
  if (newer(now.jurisdictionConfirmedAt)) {
    movers.push(`who we may contact in ${send.country ?? 'this country'} was confirmed on ${when(now.jurisdictionConfirmedAt!)}`)
  }
  if (newer(now.latestConsentAt)) {
    movers.push(`a consent event was recorded on ${when(now.latestConsentAt!)}`)
  }

  if (movers.length === 0) return { state: 'current' }

  if (citedMoved) {
    return {
      state: 'cause_gone',
      movers,
      sentence:
        'The reason given here has since been resolved, so this refusal could not be made today. ' +
        'It is left exactly as it was: it is the record of a decision that was taken. A new run makes a new row.',
    }
  }

  return {
    state: 'moved',
    movers,
    sentence:
      'Something this decision depended on has changed since. We are not saying what today’s answer would be — ' +
      'only that this one was made before the change.',
  }
}

/**
 * 🔒 Whether the flag must show on a COLLAPSED row.
 *
 * §1.4.0: staleness is one of exactly two facts never hidden behind the click,
 * because a collapsed stale refusal that looks current is the defect this
 * whole module exists to prevent — and it would be invisible in the one view
 * the reader spends most of their time in.
 */
export function showsCollapsed(s: Staleness): boolean {
  return s.state === 'moved' || s.state === 'cause_gone' || s.state === 'notChecked'
}
