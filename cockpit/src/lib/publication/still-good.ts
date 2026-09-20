/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS STILL GOOD — the documents and registrations we hold, by their dates.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 🔴 THIS IS NOT THE CLEARANCE RE-CHECK, AND THE DIFFERENCE IS THE WHOLE
 * REASON IT HAS ITS OWN NAME.
 *
 * `recheck.ts` answers "which standing clearances no longer hold" — a question
 * about decisions we made and told an agency about. It cannot run: there is no
 * `clearances` table and nothing writes one (improvements §3.22 is the sibling
 * gap). The logic is written against an input that has never been persisted.
 *
 * This module answers a narrower question that the tables we DO have can
 * answer: of the documents and registrations recorded for this client, which
 * are past their date, close to it, or resting on a status nobody has checked.
 *
 * 🔒 The two must never be read as one. "This certificate expired" is a fact
 * about a document. "This property may no longer be advertised" is a
 * conclusion about a decision, and it needs to know a decision was made. A
 * list of expired certificates presented as non-advertisable properties would
 * assert something about properties that may never have been cleared at all —
 * exactly the collapse recheck.ts spends a paragraph refusing.
 *
 * So `notAnswered` is part of the return value rather than a footnote, on the
 * same principle as recheck's `notCheckedFor`: a list with nothing in it reads
 * as "nothing is wrong", and here some of it means "that was never asked".
 */

import type { AgencyFact, PropertyFact } from './facts-store'

/** Thirty days of warning — the same figure recheck.ts argues for, imported in
 *  spirit rather than re-derived. See WARN_WITHIN_DAYS there for why a date
 *  already in the row is not the kind of default §4.6 refuses. */
export const WARN_WITHIN_DAYS = 30

/** A status nobody has confirmed for this long is one we no longer assert. */
export const STATUS_STALE_AFTER_DAYS = 90

export type DocumentStanding = 'past' | 'soon' | 'good'

export type PropertyDocument = {
  listingId: string
  reference: string | null
  requirementId: string
  certificateNumber: string | null
  /** 🔒 Never null. A fact with no date is an exemption, and is counted apart. */
  validUntil: string
  /** Negative once the date is behind us. */
  daysLeft: number
  standing: DocumentStanding
}

export type RegistrationStanding =
  /** The register says it is suspended or cancelled. Known, and known bad. */
  | 'not_valid'
  /** Typed and never checked against anything. Not the same as stale. */
  | 'never_checked'
  /** Checked once, long enough ago that we no longer assert it. */
  | 'stale'
  | 'good'

export type Registration = {
  requirementId: string
  number: string
  country: string
  region: string | null
  status: AgencyFact['status']
  checkedAt: string | null
  /**
   * ⚠️ NULL IS NOT ZERO — the same rule recheck.ts states for a revocation.
   * A registration nobody has ever checked has no interval, and reporting
   * "0 days ago" would be this system stating a fact it computed from an
   * absence.
   */
  daysSinceChecked: number | null
  standing: RegistrationStanding
}

export type StillGood = {
  documents: PropertyDocument[]
  registrations: Registration[]
  /**
   * Facts that are an exemption rather than a dated document. They appear
   * nowhere above, and the count is here so their absence is legible: an
   * exemption has no expiry because it has no certificate to expire, and a
   * screen that simply omitted them would look like it had lost them.
   */
  exempt: number
  warnWithinDays: number
  staleAfterDays: number
  /** Every figure computed at a moment says which moment (§0.4-6). */
  at: string
  /**
   * 🔴 WHAT THIS SCREEN CANNOT ANSWER, in its own words, rendered on the page.
   *
   * Empty would be a lie of omission here: the reader is looking at dates and
   * will naturally conclude things about advertisability, and the one thing
   * that would tell them is the thing we do not have.
   */
  notAnswered: string[]
}

const DAY = 86_400_000

function daysBetween(from: number, to: number): number {
  return Math.floor((to - from) / DAY)
}

/**
 * Days until a DATE, counted in whole days rather than in elapsed time.
 *
 * 🔴 `listing_facts.valid_until` is a `date` column: no time, no zone. Treating
 * it as an instant makes every answer a day too harsh once the clock is past
 * midnight — a certificate that expired three days ago reads as four, and one
 * expiring today reads as expired yesterday. Found by the first test that put a
 * real time of day on `now`.
 *
 * ⚠️ Counted on UTC calendar days, which is a simplification and is stated
 * rather than hidden: for a Lisbon operator it can be one day out for the hour
 * between local midnight and UTC midnight in summer. The honest fix threads the
 * client's timezone through (getClientTimezone exists), and it is not worth
 * doing until something renders this beside a local-day figure.
 */
function wholeDaysUntil(fromInstant: number, isoDate: string): number {
  const from = new Date(fromInstant)
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, d) - a) / DAY)
}

/**
 * The pure half: facts in, standings out. Every rule here is a test.
 *
 * `listings` maps a listing id to its agency reference, so a document can name
 * the property a person would recognise rather than a uuid.
 */
export function classifyStillGood(input: {
  propertyFacts: (PropertyFact & { listingId: string })[]
  agencyFacts: AgencyFact[]
  listings: Map<string, string | null>
  now?: Date
  warnWithinDays?: number
  staleAfterDays?: number
}): StillGood {
  const now = input.now ?? new Date()
  const warnWithinDays = input.warnWithinDays ?? WARN_WITHIN_DAYS
  const staleAfterDays = input.staleAfterDays ?? STATUS_STALE_AFTER_DAYS
  const t = now.getTime()

  const documents: PropertyDocument[] = []
  let exempt = 0

  for (const f of input.propertyFacts) {
    // 🔒 An exemption has no expiry because it has no certificate to expire.
    // 0030's fact_values_are_dated permits a null date only in this case, so
    // this branch is the constraint read back rather than a guess.
    if (f.exemption !== null) {
      exempt += 1
      continue
    }
    if (!f.validUntil) continue

    const daysLeft = wholeDaysUntil(t, f.validUntil)
    documents.push({
      listingId: f.listingId,
      reference: input.listings.get(f.listingId) ?? null,
      requirementId: f.requirementId,
      certificateNumber: f.certificateNumber,
      validUntil: f.validUntil,
      daysLeft,
      standing: daysLeft < 0 ? 'past' : daysLeft <= warnWithinDays ? 'soon' : 'good',
    })
  }

  // Worst first WITHIN this list, which is one clock — days. Nothing here is
  // ranked against the registrations below, because days-until-expiry and
  // days-since-checked are different clocks and ranking across them would be
  // inventing a threshold (§4.6).
  documents.sort((a, b) => a.daysLeft - b.daysLeft)

  const registrations: Registration[] = input.agencyFacts.map((a) => {
    const checkedAt = a.statusCheckedAt
    // 🔒 An INSTANT difference here, deliberately, and the asymmetry with the
    // documents above is the columns being different: `valid_until` is a date
    // and `status_checked_at` is a timestamptz. "Checked 91 days ago" is about
    // elapsed time; "expires in 3 days" is about calendar days.
    const daysSinceChecked = checkedAt === null ? null : daysBetween(Date.parse(checkedAt), t)

    let standing: RegistrationStanding
    if (a.status === 'suspended' || a.status === 'cancelled') {
      standing = 'not_valid'
    } else if (checkedAt === null) {
      // 🔒 Never checked is its own standing, not a very stale check. One is
      // "we have never looked", the other is "we looked, a while ago" — and
      // the first cannot be expressed as a number of days.
      standing = 'never_checked'
    } else if ((daysSinceChecked ?? 0) > staleAfterDays) {
      standing = 'stale'
    } else {
      standing = 'good'
    }

    return {
      requirementId: a.requirementId,
      number: a.number,
      country: a.country,
      region: a.region,
      status: a.status,
      checkedAt,
      daysSinceChecked,
      standing,
    }
  })

  return {
    documents,
    registrations,
    exempt,
    warnWithinDays,
    staleAfterDays,
    at: now.toISOString(),
    notAnswered: [
      'which properties were actually cleared for publication, or advertised — no clearance is recorded anywhere, so this screen reads documents rather than decisions',
      'whether the agency has already been told about anything here',
      'whether a requirement has changed since a property was last looked at',
    ],
  }
}
