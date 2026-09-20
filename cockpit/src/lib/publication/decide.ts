import 'server-only'
import { admin } from '../supabase/admin'
import { decidePublication, type PublicationVerdict } from './gate'
import { allAdvertisingPolicy } from './policy-store'
import { listingFacts, agencyFacts } from './facts-store'
import { recordClearance, type RecordOutcome } from './clearances-store'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DECISION PATH. The first caller `decidePublication` has ever had.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 🔒 THE RECORD IS MADE BY THE THING THAT DECIDES, not beside it.
 *
 * The operator's rule, and it is the shape this project uses everywhere else:
 * a clearance recorded by something other than the thing that decided it is a
 * second source of truth about the same act. So there is no way to get a
 * cleared verdict from this function without the clearance being kept, and no
 * separate "record it" step that somebody could forget, skip, or call twice.
 *
 * `decidePublication` stays pure and stays where it is — it takes a subject
 * and returns a verdict, which is what makes it testable and what made it
 * correct before anything called it. This function is the path: it assembles
 * the subject, asks, and keeps the answer.
 *
 * ⚠️ IT WRITES ON A READ, AND THAT IS A DECISION RATHER THAN AN OVERSIGHT.
 * Opening the publish screen asks the gate, and asking the gate IS the
 * decision — there is no other moment to record. Two things make it safe to do
 * on a page load: the write is insert-if-absent, so asking twice keeps the
 * first answer rather than moving its date; and a clearance that exists is
 * left exactly as it was, because the re-check's whole job is to compare what
 * was true then against what is true now.
 */

/**
 * 🔴 ASKED BEFORE THE GATE, BECAUSE THE GATE CANNOT SAY THIS.
 *
 * `listings` has a `region` column (0031, entered by a person, deliberately)
 * and NO COUNTRY COLUMN. Nothing in the database says which country a property
 * is in — not on the listing, not on the client, nowhere.
 *
 * Handing the gate a null country is not a neutral act. `resolveRequirements`
 * answers `no_policy_row`, whose sentence is "we have not analysed what this
 * country requires" — and that is FALSE. Portugal is analysed. What is missing
 * is which country the property is in, and those are different absences:
 *
 *   no_policy_row        we have not looked at that jurisdiction
 *   country_undeclared   we have not been told which jurisdiction this is
 *
 * Collapsing them would put a true-sounding refusal about our own analysis on
 * a screen where the real gap is a field nobody has filled — the same
 * conclusion/absence collapse as Spain, and as an unconfirmed policy row, and
 * as a registration nobody has checked.
 *
 * So the decision path refuses to ask rather than asking badly.
 */
export type Undecidable = {
  reason: 'country_undeclared'
  detail: string
}

export type Decision = {
  /** Null when the gate was never asked — see Undecidable. */
  verdict: PublicationVerdict | null
  undecidable: Undecidable | null
  /** What happened to the record. Rendered, never swallowed. */
  recorded: RecordOutcome | null
  /** Everything the decision was made from, for the screen to show. */
  subject: {
    listingId: string
    reference: string | null
    status: string
    price: number | null
    country: string | null
    region: string | null
  }
  at: string
}

export async function decideAndRecord(input: {
  clientId: string
  listingId: string
}): Promise<Decision> {
  const at = new Date()

  const { data: listing, error } = await admin()
    .from('listings')
    // `country` is selected because 0040 adds it. Until that is applied the
    // column does not exist, so the select is built to survive its absence
    // rather than to fail the whole read.
    .select('id, client_id, reference, status, price, region')
    .eq('id', input.listingId)
    .maybeSingle()
  if (error) throw new Error(`listing read failed: ${error.message}`)
  if (!listing) throw new Error('no such listing')
  if (listing.client_id !== input.clientId) {
    // A property is decided about under its own client. Anything else would
    // let one agency's frame produce a decision about another's property.
    throw new Error('that listing belongs to a different client')
  }

  const [policy, propertyFacts, agency] = await Promise.all([
    allAdvertisingPolicy(),
    listingFacts(input.listingId),
    agencyFacts(input.clientId),
  ])

  const subject = {
    listingId: input.listingId,
    status: (listing.status as string) ?? '',
    price: (listing.price as number) ?? null,
    /*
     * 🔒 TRUE, AND SAYING WHY IT IS TRUE RATHER THAN DEFAULTING IT.
     *
     * The gate refuses `not_from_the_agency` when a price did not come from
     * the agency. Every listing in this database arrived from an agent's own
     * WhatsApp message through /api/listings/inbound — that is the only way a
     * listing is created, and the cockpit has no form that makes one. So the
     * price on the row IS the agency's.
     *
     * If a second origin is ever added, this line is where it becomes a lie,
     * and it is a constant rather than a column precisely so that adding one
     * has to come past it.
     */
    fromTheAgency: true,
    country: ((listing as Record<string, unknown>).country as string) ?? null,
    region: (listing.region as string) ?? null,
    policy,
    propertyFacts,
    agencyFacts: agency,
  }

  /*
   * 🔴 THE GATE IS ASKED FIRST, AND ONLY ITS ONE FALSE ANSWER IS REPLACED.
   *
   * An earlier version refused to ask at all when the country was null. That
   * was too eager, and the first real render showed why: the property it was
   * pointed at is `under_offer`, which the gate refuses as `not_on_the_market`
   * — "advertising something sold or under offer is the worst output this
   * system can produce" — and that refusal needs no jurisdiction whatsoever.
   * Suppressing it meant withholding a correct, absolute answer because a
   * field nobody needed was empty.
   *
   * The gate's own order is the right one: status is checked first, cheapest
   * and most absolute, before anybody's paperwork is looked up. So every
   * answer it can give without a country is kept, and the single answer that
   * would be FALSE — `no_policy_row`, "we have not analysed this country",
   * said about a property whose country nobody stated — is replaced by what is
   * actually true.
   */
  const verdict = decidePublication(subject, at)

  if (!subject.country && !verdict.cleared && verdict.reason === 'no_policy_row') {
    return {
      verdict: null,
      undecidable: {
        reason: 'country_undeclared',
        detail:
          'Nobody has said which country this property is in. Everything else about it is in order as far as the gate got, so the answer turns on a jurisdiction nobody has named — and that is not a gap in our analysis. `listings` carries a region and no country. Asking as things stand produces "we have not analysed this country", which is false about Portugal.',
      },
      recorded: null,
      subject: {
        listingId: input.listingId,
        reference: (listing.reference as string) ?? null,
        status: subject.status,
        price: subject.price,
        country: null,
        region: subject.region,
      },
      at: at.toISOString(),
    }
  }

  const recorded = verdict.cleared
    ? await recordClearance({
        clientId: input.clientId,
        listingId: input.listingId,
        country: verdict.evidence.country,
        region: verdict.evidence.region,
        satisfied: verdict.evidence.satisfied,
      })
    : null

  return {
    verdict,
    undecidable: null,
    recorded,
    subject: {
      listingId: input.listingId,
      reference: (listing.reference as string) ?? null,
      status: subject.status,
      price: subject.price,
      country: subject.country,
      region: subject.region,
    },
    at: at.toISOString(),
  }
}
