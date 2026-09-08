/**
 * The listing lifecycle, and the single rule that decides what may be matched.
 *
 * §3: "A listing that goes under offer must stop matching. Nothing is worse
 * than telling a buyer about a house that sold last week."
 */

export const STATUSES = ['available', 'reserved', 'under_offer', 'sold', 'withdrawn'] as const
export type ListingStatus = (typeof STATUSES)[number]

/**
 * ONLY `available` may be matched.
 *
 * Written as an allow-list rather than "not sold", because a deny-list quietly
 * admits every status added later. The next status somebody invents should be
 * unmatchable until a human decides otherwise, not matchable until a human
 * remembers to exclude it.
 */
export const MATCHABLE: readonly ListingStatus[] = ['available']

export function isMatchable(status: string): boolean {
  return (MATCHABLE as readonly string[]).includes(status)
}

export function isStatus(v: string): v is ListingStatus {
  return (STATUSES as readonly string[]).includes(v)
}

export const STATUS_LABEL: Record<ListingStatus, string> = {
  available: 'Available',
  reserved: 'Reserved',
  under_offer: 'Under offer',
  sold: 'Sold',
  withdrawn: 'Withdrawn',
}

/** Said plainly on the screen, because "why is this not matching?" is the
 *  question the operator will actually have. */
export const STATUS_MEANS: Record<ListingStatus, string> = {
  available: 'Matching. This listing can be put in front of a lead.',
  reserved: 'Not matching. Reserved is not sold, but a buyer told about it now would be told about something they cannot have.',
  under_offer: 'Not matching.',
  sold: 'Not matching.',
  withdrawn: 'Not matching. Taken off the market by the agency.',
}

/**
 * A status change sent as a WhatsApp message.
 *
 * Deliberately conservative: an unrecognised phrase returns null and the
 * message is answered with a question, never guessed at. Guessing "sold" from
 * an ambiguous sentence takes a listing out of matching silently; guessing
 * "available" puts a sold house back in front of buyers. Both are worse than
 * asking, and this is the one place in the automation where the cost of a
 * wrong guess is a lead being told about a house somebody else has bought.
 */
import { negatedAt } from '@/lib/text/negation'

export function statusFromText(raw: string): ListingStatus | null {
  const s = (raw ?? '').toLowerCase().trim()
  if (!s) return null

  // IDIOMS FIRST. These contain a negator as part of their meaning, so they
  // have to be recognised before the negation guard sees them.
  if (/\b(no longer available|já não está disponível|ja nao esta disponivel|ya no está disponible|off the market|fora do mercado|retirado do mercado)\b/.test(s)) {
    return 'withdrawn'
  }
  if (/\b(available again|back on the market|disponível novamente|disponivel novamente)\b/.test(s)) {
    return 'available'
  }

  const PATTERNS: [RegExp, ListingStatus][] = [
    [/\b(sold|vendid[oa]|vendu|cerrad[oa])\b/, 'sold'],
    [/\b(under offer|sob proposta|com proposta|en oferta|oferta aceite)\b/, 'under_offer'],
    [/\b(reserved|reservad[oa])\b/, 'reserved'],
    [/\b(withdrawn|retirad[oa])\b/, 'withdrawn'],
    [/\b(available|disponível|disponivel|disponible)\b/, 'available'],
  ]

  for (const [re, status] of PATTERNS) {
    const m = s.match(re)
    if (!m || m.index === undefined) continue
    // A negated phrase is AMBIGUOUS, not the opposite. "not sold" does not mean
    // available — it means the agent is telling you something this parser
    // should not be inferring a lifecycle change from. Ask instead.
    if (negatedAt(s, m.index)) return null
    return status
  }
  return null
}
