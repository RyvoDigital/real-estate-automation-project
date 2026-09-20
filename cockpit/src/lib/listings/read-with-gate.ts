import 'server-only'

import { listListings, type Listing } from './store'
import { advertisabilityFrom, isAsked, type Advertisability } from './advertisability'
import { decidePublication } from '@/lib/publication/gate'
import { allAdvertisingPolicy } from '@/lib/publication/policy-store'
import { listingFacts, agencyFacts } from '@/lib/publication/facts-store'

/*
 * ═════════════════════════════════════════════════════════════════════════════
 * WHAT THE AGENCY HAS, AND WHAT THE LAW SAYS ABOUT EACH ONE.
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * 🔴 IT ASKS THE GATE AND RECORDS NOTHING.
 *
 * `decideAndRecord` is the publication screen's path: asking and keeping the
 * answer in one act, because a clearance recorded by something other than the
 * thing that decided it is a second source of truth. That is right THERE and
 * wrong here — opening a list of forty properties must not write forty
 * clearances, and a clearance is a dated record that a decision was taken for a
 * reason, not a cache of a screen's last render.
 *
 * So this calls `decidePublication`, the PURE gate, and stores nothing.
 *
 * 🔒 It also never triggers a matching run. An operator refreshing a page must
 * not rewrite match rows, and on a notified listing that is an attempt to
 * change a record somebody has already acted on.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 A DESIGN CONTRADICTION, RECORDED RATHER THAN RESOLVED HERE — §3.28
 * ─────────────────────────────────────────────────────────────────────────────
 * Brief III §5 requires the table to show the two columns moving independently
 * IN BOTH DIRECTIONS, and names the second case explicitly: *"a `Reservado`
 * property the law permits."*
 *
 * That cell cannot be produced. `decidePublication`'s first rule — cheapest and
 * most absolute, before anybody's paperwork is looked up — refuses anything
 * that is not `available` with `not_on_the_market`. So a reserved property is
 * always refused, and the legal column would read "may not be advertised" for
 * every one of them, which couples the two columns exactly where §5 says they
 * must be seen to separate.
 *
 * 🔒 THE GATE IS NOT WRONG. It answers *may I advertise this now*, and for a
 * reserved property the answer is genuinely no. §5's sample assumes the column
 * answers a different question — *does the paperwork permit advertising this
 * property* — which is a question nothing currently computes.
 *
 * §1s again: a fact correct where it was written, arriving somewhere it means
 * something else. Not resolved by inventing a second gate, and NOT resolved by
 * passing a fabricated `status: 'available'` to get the paperwork half — that
 * would render "may be advertised" for a property that is sold.
 *
 * So this returns the gate's own answer, truthfully, and the contradiction is
 * the operator's to settle.
 */

export type ListingRow = {
  listing: Listing
  advertisability: Advertisability
  /** The gate's own sentence, where it refused. Never re-worded here. */
  detail: string | null
}

export type ListingsView = {
  rows: ListingRow[]
  /** 🔒 The moment the COMPUTED column was worked out. The stored column has none. */
  at: string
} | null

export async function readListingsWithGate(clientId: string): Promise<ListingsView> {
  try {
    const at = new Date()
    const [listings, policy, agency] = await Promise.all([
      listListings(clientId),
      allAdvertisingPolicy(),
      agencyFacts(clientId),
    ])

    const rows = await Promise.all(
      listings.map(async (listing): Promise<ListingRow> => {
        const country = (listing as Listing & { country?: string | null }).country ?? null

        // 🔒 Not asked at all for an ended status, or where nobody recorded a
        // country. Skipping the read as well as the verdict, because the
        // cheapest way not to state a conclusion is not to compute one.
        if (!isAsked(listing.status) || !country) {
          return {
            listing,
            advertisability: advertisabilityFrom({ status: listing.status, country, verdict: null }),
            detail: null,
          }
        }

        const facts = await listingFacts(listing.id)
        const verdict = decidePublication(
          {
            listingId: listing.id,
            status: listing.status,
            price: listing.price,
            // 🔒 A constant, not a column, exactly as `decide.ts` has it: a
            // listing arrives from an agent over WhatsApp, and if a second
            // origin is ever added this line is where it becomes a lie.
            fromTheAgency: true,
            country,
            region: (listing as Listing & { region?: string | null }).region ?? null,
            policy,
            propertyFacts: facts,
            agencyFacts: agency,
          },
          at,
        )

        return {
          listing,
          advertisability: advertisabilityFrom({ status: listing.status, country, verdict }),
          detail: verdict.cleared ? null : verdict.detail,
        }
      }),
    )

    return { rows, at: at.toISOString() }
  } catch {
    return null
  }
}
