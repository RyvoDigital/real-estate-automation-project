/**
 * Obligations that ride with a permission, and what discharges them.
 *
 * `evaluatePolicy` can return a permission carrying obligations — Portugal's
 * Art. 13.º-B requires the sender to maintain lists of those who consented and
 * of customers who did not object. Recording that on the send row proves we
 * knew about it. Proving we knew about a duty nothing performs is WORSE than
 * never recording it, so:
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ AN OBLIGATION WITH NO REGISTERED DISCHARGE MAKES THE PERMISSION A       │
 * │ REFUSAL.                                                                │
 * │                                                                         │
 * │ A lawyer adding "…and you must also do X" to a policy row cannot        │
 * │ silently create a duty nothing performs. Either X appears here with a   │
 * │ discharge and a check, or that jurisdiction stops permitting sends.     │
 * │ The failure mode is a blocked campaign with a visible reason, which is  │
 * │ the right direction for this to fail in.                                │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * OBLIGATIONS ARE CODES, NOT PROSE. A free-text obligation cannot be counted,
 * checked or discharged — it can only be read by someone who already knows to
 * look. The prose lives here, beside the mechanism.
 */

export type ObligationCode = 'pt_13b_lists'

export type Obligation = {
  code: ObligationCode
  /** What the law requires, in words, for the operator screen and the record. */
  requires: string
  /** The statutory source, so the send row can name it. */
  source: string
  /** Who performs it. We are a processor; most of these are the agency's. */
  owner: 'agency' | 'ryvo'
  /** How it is performed — the artefact or action that satisfies it. */
  discharge: string
  /**
   * How we know it is still being performed. A discharge that lapses while
   * sends continue under it is the stale-state family, so every obligation
   * must be checkable rather than assumed (§5.4 of the design).
   */
  check: string
  /** Days after which a discharge is considered stale and must be re-evidenced. */
  staleAfterDays: number
}

export const OBLIGATIONS: Record<ObligationCode, Obligation> = {
  pt_13b_lists: {
    code: 'pt_13b_lists',
    requires:
      'Manter lista actualizada das pessoas que consentiram e dos clientes que não se opuseram',
    source: 'Lei n.º 41/2004, art. 13.º-B',
    owner: 'agency',
    discharge:
      'A view over consent_events producing both lists per client, exportable on request. ' +
      'We provide the artefact; the agency holds the obligation.',
    check:
      'Scheduled: for every client with a send under a basis carrying this code in the last 30 days, ' +
      'the lists view returns rows and its most recent consent_event is no older than the client\'s ' +
      'last send. An empty list under an active campaign is a violation, not an absence.',
    staleAfterDays: 30,
  },
}

export function isKnownObligation(code: string): code is ObligationCode {
  return Object.prototype.hasOwnProperty.call(OBLIGATIONS, code)
}

/**
 * Split obligation codes into those we can discharge and those we cannot.
 *
 * The caller is the gate, and an unknown code is a refusal rather than a
 * warning. Returning both lists rather than throwing keeps the refusal's
 * DETAIL able to name what it did not recognise (§11).
 */
export function partitionObligations(codes: unknown): {
  known: Obligation[]
  unknown: string[]
} {
  const list = Array.isArray(codes) ? codes.map(String) : []
  const known: Obligation[] = []
  const unknown: string[] = []
  for (const c of list) {
    if (isKnownObligation(c)) known.push(OBLIGATIONS[c])
    else unknown.push(c)
  }
  return { known, unknown }
}
