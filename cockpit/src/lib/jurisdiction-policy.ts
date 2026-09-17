/**
 * What a country permits, and the refusal when it permits nothing.
 *
 * `jurisdiction_policy` holds one row per country: the statutory basis, the
 * traps, and — the field everything turns on — whether a lawyer has CONFIRMED
 * it. The structure is technical; the content is a lawyer's (Enquadramento
 * §8.3). So:
 *
 *   no row            -> refused
 *   unconfirmed row   -> refused
 *   confirmed row     -> whatever it says, per segment
 *
 * An incomplete table therefore cannot be wrong in the dangerous direction. It
 * can only be wrong by being confirmed wrongly, which takes a human act that
 * leaves a name and a date on the row.
 *
 * THIS IS THE POLICY HALF OF THE GATE AND IT IS DELIBERATELY PURE.
 * It takes a row and a segment and returns a verdict. It reads no database,
 * makes no network call, and knows nothing about a particular contact — which
 * is what lets the whole matrix be tested without writing anything anywhere.
 * The gate (piece 4) composes this with suppression, with the resolved country,
 * and with the ledger's consent state.
 *
 * WHAT IT IS NOT: the ledger's business. `consent_by_contact` reports what was
 * said and when. This says what may be done about it HERE. Keeping those apart
 * is what makes "one table changes and every client is compliant tomorrow"
 * true; baking today's Spanish reading into the derivation would not.
 */

import { partitionObligations } from '@/lib/obligations'

export type Segment = 'A' | 'B' | 'C' | 'D' | 'E'

export type PolicyRow = {
  country: string
  existing_customer: 'available' | 'unavailable' | 'unknown'
  consent_request: 'permitted' | 'prohibited' | 'unknown'
  consent_expiry_months: number | null
  platform_blocked: boolean
  platform_note: string | null
  statute: string | null
  authority: string | null
  traps: string | null
  /** Obligation CODES, not prose. Resolved against src/lib/obligations.ts. */
  obligation_codes: string[] | null
  confirmed_at: string | null
  confirmed_by: string | null
}

export type PolicyRefusal =
  | 'no_policy_row'
  | 'not_confirmed'
  | 'platform_blocked'
  | 'objected'
  | 'origin_undetermined'
  | 'existing_customer_unavailable'
  | 'existing_customer_unknown'
  | 'consent_request_prohibited'
  | 'consent_request_unknown'
  | 'consent_expired'
  | 'consent_undated'
  | 'obligation_undischargeable'

export type PolicyVerdict =
  | { permitted: true; basis: string; obligationCodes: string[] }
  | { permitted: false; reason: PolicyRefusal; detail: string }

export const POLICY_REFUSAL_MEANS: Record<PolicyRefusal, string> = {
  no_policy_row:
    'No policy row for this country. An unanalysed jurisdiction is a stop, never a shrug.',
  not_confirmed:
    'The row exists but no lawyer has confirmed it. Research is not advice, and an unconfirmed row permits nothing.',
  platform_blocked:
    'Meta will not deliver marketing templates to this country. A platform refusal needs no legal analysis.',
  objected:
    'This contact objected. Permanent, and checked before this point too — reaching here means a caller skipped suppression.',
  origin_undetermined:
    'Segment D: the agency cannot say where this contact came from, so there is no basis to send.',
  existing_customer_unavailable:
    'The existing-customer route is not available in this country, so a past transaction is not a basis.',
  existing_customer_unknown:
    'Whether the existing-customer route exists here has not been analysed. Unknown is not permission.',
  consent_request_prohibited:
    'Consent may not be requested over this channel in this country — the request is itself a commercial communication.',
  consent_request_unknown:
    'Whether consent may be requested over this channel here is unanalysed, and is the open Gate A question.',
  consent_expired:
    'The consent is older than this jurisdiction allows. Ireland lapses at twelve months from the act.',
  consent_undated:
    'A consent with no date cannot be expiry-checked in a country that imposes expiry, so it cannot be honoured.',
  obligation_undischargeable:
    'This permission carries an obligation nothing in the system knows how to discharge. Proving we knew of a duty nobody performs is worse than not recording it, so the permission is refused until the obligation has a discharge and a check.',
}

/**
 * evaluatePolicy(row, segment, opts)
 *
 * `consentOccurredAt` is only consulted for segment B in a country with an
 * expiry, and its ABSENCE there is a refusal rather than a pass: an undated
 * consent cannot be aged.
 */
export function evaluatePolicy(
  row: PolicyRow | null | undefined,
  segment: Segment,
  opts: { consentOccurredAt?: string | null; now?: Date } = {},
): PolicyVerdict {
  const no = (reason: PolicyRefusal, detail?: string): PolicyVerdict => ({
    permitted: false,
    reason,
    detail: detail ?? POLICY_REFUSAL_MEANS[reason],
  })

  // Defence in depth. Suppression is checked before policy is ever consulted,
  // so this branch should be unreachable -- which is exactly why it is here.
  if (segment === 'E') return no('objected')

  if (!row) return no('no_policy_row')

  // A platform refusal is a fact about delivery, not a legal conclusion, so it
  // is answered before the confirmation question and needs no lawyer.
  if (row.platform_blocked) {
    return no('platform_blocked', row.platform_note ?? POLICY_REFUSAL_MEANS.platform_blocked)
  }

  if (!row.confirmed_at || !row.confirmed_by) return no('not_confirmed')

  if (segment === 'D') return no('origin_undetermined')

  if (segment === 'A') {
    if (row.existing_customer === 'available') {
      return permit(row, `existing-customer route, ${row.statute ?? 'statute not recorded'}`)
    }
    return no(
      row.existing_customer === 'unavailable'
        ? 'existing_customer_unavailable'
        : 'existing_customer_unknown',
    )
  }

  if (segment === 'C') {
    if (row.consent_request === 'permitted') {
      return permit(row, `consent request permitted, ${row.statute ?? 'statute not recorded'}`)
    }
    return no(
      row.consent_request === 'prohibited'
        ? 'consent_request_prohibited'
        : 'consent_request_unknown',
    )
  }

  // Segment B: documented consent, the only route that travels everywhere --
  // subject to this jurisdiction's expiry, where it has one.
  if (row.consent_expiry_months != null) {
    if (!opts.consentOccurredAt) return no('consent_undated')
    const then = new Date(opts.consentOccurredAt).getTime()
    if (!Number.isFinite(then)) return no('consent_undated')
    const months = (( opts.now ?? new Date() ).getTime() - then) / (1000 * 60 * 60 * 24 * 30.4375)
    if (months > row.consent_expiry_months) {
      return no(
        'consent_expired',
        `consent is about ${Math.floor(months)} months old; ${row.country} allows ${row.consent_expiry_months}`,
      )
    }
  }

  return permit(
    row,
    `documented consent${row.consent_expiry_months != null ? `, within ${row.consent_expiry_months} months` : ''}`,
  )
}

/**
 * Every permission goes through here, so the obligation check cannot be
 * forgotten on one branch. Three call sites, one gate on all of them --
 * §12: prefer a boundary to a rule.
 */
function permit(row: PolicyRow, basis: string): PolicyVerdict {
  const { known, unknown } = partitionObligations(row.obligation_codes)
  if (unknown.length > 0) {
    return {
      permitted: false,
      reason: 'obligation_undischargeable',
      detail:
        `${POLICY_REFUSAL_MEANS.obligation_undischargeable} Unrecognised: ${unknown.join(', ')}. ` +
        `Add it to src/lib/obligations.ts with a discharge and a check, or remove it from the ${row.country} policy row.`,
    }
  }
  return { permitted: true, basis, obligationCodes: known.map((o) => o.code) }
}
