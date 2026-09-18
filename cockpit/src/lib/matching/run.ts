import type { Requirement } from './criteria'
import { missingThresholds, scoreListing, type Listing, type MatchResult, type Thresholds } from './score'

/**
 * The matching run: one listing against every lead we hold requirements for.
 *
 * Pure. Rows in, a plan out, no database and no network — the same shape as
 * `decideGate` and the campaign runner, and for the same reason: the part worth
 * proving is the DECISION, and a decision that needs a database to be tested is
 * tested one layer at a time.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * 1. A RUN THAT CANNOT MATCH SAYS SO. IT DOES NOT MATCH BADLY.
 * ───────────────────────────────────────────────────────────────────────────
 * §4.6: every threshold lives in `client_automations.config`, because any value
 * chosen now is a guess and the calibration method is half an hour with a real
 * agent over ~20 real leads and 3 real listings. So an unconfigured client
 * produces a REFUSAL NAMING WHAT IS ABSENT, never a match computed from
 * invented numbers.
 *
 * No client has thresholds today. The honest first output of this function is
 * therefore `thresholds_not_configured`, listing the six keys — and that is the
 * correct result rather than a bug to code around. Seeding a client to make it
 * return matches would invent both the input and the right answer, which proves
 * the code runs and says nothing about whether the matching is right.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * 2. A LEAD WITH NOTHING BINDING IS NOT A WEAK MATCH. IT IS NOT A MATCH.
 * ───────────────────────────────────────────────────────────────────────────
 * `scoreListing` already refuses a lead with no hard constraint, because "every
 * hard constraint held" is vacuously true of nothing and every listing matches.
 * This run reports those leads SEPARATELY and by count, as
 * `unmatchable_no_requirements` — they are precisely the candidate set the
 * triage floor exists for (no-crm-design §2), and an agency whose whole list
 * lands there needs to be told that in a number rather than by an empty screen.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * 3. THE STATUS SNAPSHOT TRAVELS WITH THE MATCH
 * ───────────────────────────────────────────────────────────────────────────
 * Every row carries what the listing WAS when it was judged, so the send path
 * can refuse if it has moved since. 0009's header argues why checking only at
 * match time is check-then-act and why no window is small enough to make that
 * safe.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * 4. THIS FILE HAS NO ROUTE TO A SEND, AND NO ROUTE TO THE GATE
 * ───────────────────────────────────────────────────────────────────────────
 * It produces `listing_matches` rows. A row here says a listing is FOR
 * somebody; it never says anybody should be messaged, and nothing downstream
 * may read it to decide that. Conversely this run must never consult the gate,
 * the ledger or the suppression list to decide whether to MATCH: who may be
 * contacted is a question asked at send time, and answering it here would build
 * a second, quieter gate out of a matching filter.
 *
 * `tests/matching-boundary.test.ts` holds both directions of that as a
 * source-level check.
 */

export type CandidateLead = {
  leadId: string
  /** Binding requirements only — anything superseded is already excluded. */
  requirements: Requirement[]
  budgetFlexible: boolean
  /** The stored fields, for the would-a-filter-find-it comparison. */
  fields: { budget_max: number | null; area: string | null; bedrooms: number | null }
}

export type MatchRow = {
  leadId: string
  origin: 'computed'
  score: number
  strength: 'strong' | 'possible' | 'weak'
  filterWouldFind: boolean
  reasoning: {
    hardMet: unknown[]
    hardFailed: unknown[]
    preferencesMet: unknown[]
    preferencesMissed: unknown[]
    superseded: unknown[]
    reasons: string[]
  }
  listingStatusAtMatch: string
  listingStatusChangedAtAtMatch: string | null
}

export type MatchRunRefusal =
  | { reason: 'thresholds_not_configured'; missing: string[]; detail: string }
  | { reason: 'listing_not_matchable'; status: string; detail: string }

export type MatchRunPlan =
  | { ran: false; refusal: MatchRunRefusal }
  | {
      ran: true
      matches: MatchRow[]
      /** Considered and not matched, with the reason, per lead. */
      rejected: { leadId: string; reasons: string[] }[]
      /** No hard constraint at all — the triage candidate set. */
      unmatchableNoRequirements: string[]
      considered: number
    }

/**
 * Only `available` matches. Named here as well as in the query because this
 * function is pure and a caller could hand it anything — and "telling a buyer
 * about a house that sold last week is the worst output this automation can
 * produce" (0009).
 */
const MATCHABLE = 'available'

export const REFUSAL_MEANS: Record<MatchRunRefusal['reason'], string> = {
  thresholds_not_configured:
    'This client has no matching thresholds in client_automations.config, so there is no ' +
    'honest way to decide whether a listing is a match. The values are a judgement — the ' +
    'method is half an hour with a real agent over about twenty real leads and three real ' +
    'listings (§4.6) — and anything chosen here would be a guess wearing a number.',
  listing_not_matchable:
    'This listing is not available, so it must not be matched against anybody. A buyer ' +
    'hearing about a house that is no longer for sale is the worst output this automation ' +
    'can produce, and the damage lands on the client in front of their own customer.',
}

export function planMatchRun(input: {
  listing: Listing & { statusChangedAt: string | null }
  candidates: CandidateLead[]
  /** `client_automations.config` verbatim. Never defaulted, never merged. */
  config: unknown
}): MatchRunPlan {
  const missing = missingThresholds(input.config)
  if (missing.length > 0) {
    return {
      ran: false,
      refusal: {
        reason: 'thresholds_not_configured',
        missing,
        detail:
          `${REFUSAL_MEANS.thresholds_not_configured} Missing: ${missing.join(', ')}.`,
      },
    }
  }

  if (input.listing.status !== MATCHABLE) {
    return {
      ran: false,
      refusal: {
        reason: 'listing_not_matchable',
        status: input.listing.status,
        detail: `${REFUSAL_MEANS.listing_not_matchable} This one is ${input.listing.status}.`,
      },
    }
  }

  const thresholds = input.config as Thresholds
  const matches: MatchRow[] = []
  const rejected: { leadId: string; reasons: string[] }[] = []
  const unmatchableNoRequirements: string[] = []

  for (const c of input.candidates) {
    // Superseded requirements are already excluded by the extractor, and
    // `scoreListing` refuses to judge one that slipped through. Belt and braces
    // is deliberate here: this is the only consumer, and a stale requirement
    // binding a match is invisible in the output.
    const binding = c.requirements.filter((r) => !r.supersededBy)
    const hasHard = binding.some((r) => r.strength === 'hard')
    if (!hasHard) {
      unmatchableNoRequirements.push(c.leadId)
      continue
    }

    const r: MatchResult = scoreListing({
      requirements: binding,
      listing: input.listing,
      thresholds,
      budgetFlexible: c.budgetFlexible,
      fields: c.fields,
    })

    if (!r.matched || r.strength === 'none') {
      rejected.push({ leadId: c.leadId, reasons: r.reasons })
      continue
    }

    matches.push({
      leadId: c.leadId,
      origin: 'computed',
      score: r.score,
      strength: r.strength,
      filterWouldFind: r.filterWouldFind,
      reasoning: {
        hardMet: r.hardMet,
        hardFailed: r.hardFailed,
        preferencesMet: r.preferencesMet,
        preferencesMissed: r.preferencesMissed,
        superseded: r.superseded,
        reasons: r.reasons,
      },
      listingStatusAtMatch: input.listing.status,
      listingStatusChangedAtAtMatch: input.listing.statusChangedAt,
    })
  }

  // Strongest first, ties broken by lead id so the order is total and a run is
  // reproducible -- "which six did it find" is a question somebody asks later.
  matches.sort((a, b) => b.score - a.score || a.leadId.localeCompare(b.leadId))

  return {
    ran: true,
    matches,
    rejected,
    unmatchableNoRequirements,
    considered: input.candidates.length,
  }
}
