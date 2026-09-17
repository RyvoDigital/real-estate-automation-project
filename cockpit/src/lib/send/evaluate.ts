import { decideGate, type ConsentFacts, type GateVerdict } from '@/lib/gate'
import type { PolicyRow } from '@/lib/jurisdiction-policy'
import { resolveJurisdiction } from '@/lib/jurisdiction'

/**
 * Phase 1 of a campaign: decide every contact, produce the shape, and write
 * nothing.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ THIS PRODUCES A FORECAST. IT AUTHORISES NOTHING.                        │
 * │                                                                         │
 * │ A permission decided at 09:00 and acted on at 14:00 is stale by          │
 * │ construction: it would widen the objection race from the seconds inside  │
 * │ dispatch() to the length of a campaign, manufacturing the exact          │
 * │ condition invariant 3 exists to catch. So the gate runs AGAIN            │
 * │ immediately before each send, and only that second run mints a permit.   │
 * │                                                                         │
 * │ The gate running twice is not waste. The first run is what the operator  │
 * │ sees; the second is what authorises.                                     │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * PURE, AND THAT IS WHY THIS IS TWO QUERIES RATHER THAN SIX HUNDRED.
 * `decideGate` was made pure so the layer order could be tested exhaustively.
 * The same property lets a caller read every consent state in one `in (…)`,
 * every distinct country in another, and then decide three hundred contacts in
 * memory (engineering-lessons §12b).
 */

export type Contact = {
  phone: string
  leadId?: string | null
}

/**
 * A refusal that can never become a permission, because it is a fact about the
 * CONTACT rather than about our state.
 *
 *   objected              permanent by design — rule 1 of the derivation
 *   unparseable/invalid   a number that cannot be read will not start parsing
 *   reserved_test_number  a fixture, and fixtures are never messageable
 *
 * Everything else — an unconfirmed jurisdiction, nothing in the ledger, an
 * unknown existing-customer route — flips the day a lawyer confirms a row, an
 * agency declares a segment, or an import lands. Those are re-asked every run
 * because the answer really does change.
 *
 * `consent_expired` is deliberately NOT here: a lapsed consent can be renewed.
 */
const TERMINAL: ReadonlySet<string> = new Set([
  'objected', 'unparseable', 'invalid', 'reserved_test_number',
])

export function isTerminalRefusal(reason: string): boolean {
  return TERMINAL.has(reason)
}

export type Evaluation = {
  /** Forecast only. The gate runs again before each of these is sent. */
  permitted: Array<{ contact: Contact; verdict: Extract<GateVerdict, { permitted: true }> }>
  /** Written per run: the answer may differ next time. */
  refused: Array<{ contact: Contact; verdict: Extract<GateVerdict, { permitted: false }> }>
  /** Written once ever, then excluded from future target lists. */
  excluded: Array<{ contact: Contact; verdict: Extract<GateVerdict, { permitted: false }> }>

  targetCount: number
  forecastPermitted: number
  forecastRefused: number
  excludedCount: number
  /** Counts by reason, which is the operator's headline. */
  refusalBreakdown: Record<string, number>
  excludedBreakdown: Record<string, number>
}

export function evaluateCampaign(input: {
  contacts: Contact[]
  /** By phone, from one `consent_by_contact` query. */
  consentByPhone: Map<string, ConsentFacts>
  /** By country, from one `jurisdiction_policy` query. */
  policyByCountry: Map<string, PolicyRow>
  /** Contacts already carrying a terminal refusal, excluded before evaluation. */
  alreadyTerminal?: ReadonlySet<string>
  now?: Date
}): Evaluation {
  const permitted: Evaluation['permitted'] = []
  const refused: Evaluation['refused'] = []
  const excluded: Evaluation['excluded'] = []
  const refusalBreakdown: Record<string, number> = {}
  const excludedBreakdown: Record<string, number> = {}
  const seen = new Set<string>()

  for (const contact of input.contacts) {
    // A contact listed twice is one contact. Deduplicated here rather than by
    // the caller, because a double send is the failure this whole path exists
    // to prevent and it must not depend on how the list was built.
    if (seen.has(contact.phone)) continue
    seen.add(contact.phone)

    // Already known to be permanently uncontactable: excluded without
    // re-deciding, and counted so the exclusion is visible rather than a
    // silent drop.
    if (input.alreadyTerminal?.has(contact.phone)) {
      const already = {
        permitted: false as const,
        layer: 'suppression' as const,
        reason: 'objected' as const,
        detail: 'Already carries a terminal refusal from an earlier run; not re-evaluated.',
      }
      excluded.push({ contact, verdict: already })
      excludedBreakdown.already_terminal = (excludedBreakdown.already_terminal ?? 0) + 1
      continue
    }

    const consent = input.consentByPhone.get(contact.phone) ?? null
    const verdict = decideGate({
      phone: contact.phone,
      consent,
      // `undefined` and a missing row mean the same thing to the gate, and it
      // refuses on both — a country with no policy entry is not contactable.
      policy: policyFor(contact.phone, input.policyByCountry),
      now: input.now,
    })

    if (verdict.permitted) {
      permitted.push({ contact, verdict })
      continue
    }

    if (isTerminalRefusal(verdict.reason)) {
      excluded.push({ contact, verdict })
      excludedBreakdown[verdict.reason] = (excludedBreakdown[verdict.reason] ?? 0) + 1
    } else {
      refused.push({ contact, verdict })
      refusalBreakdown[verdict.reason] = (refusalBreakdown[verdict.reason] ?? 0) + 1
    }
  }

  return {
    permitted, refused, excluded,
    targetCount: seen.size,
    forecastPermitted: permitted.length,
    forecastRefused: refused.length,
    excludedCount: excluded.length,
    refusalBreakdown, excludedBreakdown,
  }
}

/**
 * The policy row for a contact's country.
 *
 * THIS RESOLVES THE COUNTRY PROPERLY. The first version picked a row by
 * dialling prefix — a prefix table, the exact defect the resolver exists to
 * prevent, reintroduced three hours after it was found. It would have handed
 * +447911123456 the United Kingdom's row, and the gate (which did not then
 * check) would have evaluated a Guernsey contact under PECR.
 *
 * Two fixes were made, and both were needed: this looks the country up with
 * libphonenumber, and `decideGate` now refuses a row whose country is not the
 * one it resolved. A caller that gets this right never sees that refusal; a
 * caller that does not gets a refusal rather than a wrong permission.
 */
function policyFor(phone: string, byCountry: Map<string, PolicyRow>): PolicyRow | undefined {
  const j = resolveJurisdiction(phone)
  // An unresolvable number has no country and therefore no policy. The gate
  // refuses it at layer 2, before the policy question is reached at all.
  return j.ok ? byCountry.get(j.country) : undefined
}
