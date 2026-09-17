import { resolveJurisdiction, REFUSAL_MEANS, type JurisdictionRefusal } from '@/lib/jurisdiction'
import { isReservedTestNumber, RESERVED_TEST_REASON } from '@/lib/reserved-numbers'
import {
  evaluatePolicy,
  POLICY_REFUSAL_MEANS,
  type PolicyRefusal,
  type PolicyRow,
  type Segment,
} from '@/lib/jurisdiction-policy'

/**
 * The send gate — Stage 1, piece 4. The only route to a business-initiated
 * message.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ DECISION, 17 September 2026: THE COCKPIT OWNS THE GATE AND n8n NEVER    │
 * │ SENDS MARKETING DIRECTLY.                                              │
 * │                                                                         │
 * │ Not for convenience. The convenience argument — that everything this    │
 * │ needs is already TypeScript, since libphonenumber-js cannot be used in  │
 * │ an n8n code node — would evaporate the moment something else was        │
 * │ easier, and a structural property must not rest on that.                │
 * │                                                                         │
 * │ The reason: THE GATE MUST BE THE ONLY ROUTE TO A SEND. If n8n can send  │
 * │ *and* call the gate, the gate is a step in a process rather than a      │
 * │ gate, and every future path is one forgotten call away from bypassing   │
 * │ it. If n8n cannot send marketing at all, the property is structural      │
 * │ rather than remembered.                                                 │
 * │                                                                         │
 * │ The rejected alternative was n8n calling a cockpit endpoint. It keeps   │
 * │ one gate, and it adds a failure mode where the gate is UNREACHABLE on a │
 * │ send path — which either blocks legitimate sends or tempts someone to   │
 * │ write a fallback. That fallback is the entire problem, and it would be  │
 * │ written at 2am by someone fixing an outage.                             │
 * │                                                                         │
 * │ So: the Concierge keeps replying inside the 24-hour window the lead     │
 * │ opened, which needs no gate. Everything business-initiated originates   │
 * │ here.                                                                   │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * FIVE LAYERS, IN THIS ORDER, AND THE ORDER IS PART OF THE DESIGN
 *
 *   1. reserved      the test range, refused outright before anything is asked
 *   2. resolution    no country, no law, no send
 *   3. suppression   an objection, which is permanent
 *   4. basis         what the ledger says was said about this contact
 *   5. policy        what this country permits for that basis
 *
 * Cheapest and most absolute first. A reserved number is refused before a
 * database is touched; an objection is found before a policy is read. Anything
 * that reorders these makes a send depend on a question that should never have
 * been reached.
 *
 * THE VERDICT IS NEVER A BOOLEAN (engineering-lessons §11). A permission
 * carries its basis and every obligation attached to it; a refusal carries
 * which layer refused, which reason, and wording a human can act on.
 *
 * THIS FILE HOLDS NO IO AND NO `server-only`, DELIBERATELY. The first version
 * imported the Supabase client and marked itself server-only, which made
 * `decideGate` unimportable from a plain test -- defeating the entire reason it
 * is a pure function. The reads live in gate-read.ts. A gate whose decision
 * cannot be tested without a database is a gate tested one layer at a time,
 * and the layer ORDER is the part most worth proving.
 */

export type GateLayer = 'reserved' | 'resolution' | 'suppression' | 'basis' | 'policy'

export type GateVerdict =
  | {
      permitted: true
      basis: string
      /**
       * Obligation CODES that ride WITH the permission, never separately (§11).
       * Resolved to prose through src/lib/obligations.ts; an unrecognised code
       * never reaches here, because it turns the permission into a refusal.
       */
      obligations: string[]
      evidence: {
        country: string
        segment: Segment
        consentEventId: string | null
        consentOccurredAt: string | null
        policyConfirmedAt: string
        policyConfirmedBy: string
      }
    }
  | {
      permitted: false
      layer: GateLayer
      reason: JurisdictionRefusal | PolicyRefusal | 'reserved_test_number' | 'objected' | 'no_ledger_basis' | 'policy_country_mismatch'
      detail: string
    }

/** What `consent_by_contact` returns, as the gate needs it. */
export type ConsentFacts = {
  state: 'objected' | 'consented' | 'declared' | 'claimed_unevidenced' | 'undetermined'
  segment: Segment | null
  occurred_at: string | null
  event_id: string | null
} | null

/**
 * Ledger state to the segment the policy speaks in.
 *
 * EXHAUSTIVE OVER THE STATE UNION ON PURPOSE. The `never` assignment below
 * fails to compile if a state is added to `consent_by_contact` without a
 * decision being made here. A new state falling through to a default is the
 * wrong shape for a decision about whether to message somebody -- and the
 * default that would have absorbed it is the one that PERMITS, since anything
 * mapping to B or a declared segment goes on to be evaluated.
 *
 * `claimed_unevidenced` maps to D, which layer 4 refuses BEFORE any policy row
 * is read. So no policy row, however permissive, can reach it. That state means
 * the agency asserted something we cannot use: it is not a weaker form of
 * consent, it is a stronger form of nothing.
 */
function segmentFor(consent: ConsentFacts): Segment {
  if (!consent) return 'D'
  switch (consent.state) {
    case 'consented': return 'B'
    case 'declared': return consent.segment ?? 'D'
    case 'objected': return 'E'
    case 'claimed_unevidenced': return 'D'
    case 'undetermined': return 'D'
    default: {
      const unhandled: never = consent.state
      throw new Error(`gate: no segment decided for ledger state "${String(unhandled)}"`)
    }
  }
}

/**
 * The whole decision, as a pure function of facts already gathered.
 *
 * Every branch is reachable from a test with no database, which is the only
 * reason the matrix below can be exhaustive. `mayContact` is the thin IO
 * wrapper; this is the gate.
 */
export function decideGate(input: {
  phone: string
  consent: ConsentFacts
  policy: PolicyRow | null | undefined
  now?: Date
}): GateVerdict {
  // 1. RESERVED. First, and before any database is touched. The fixtures for an
  // append-only ledger must never be messageable, and "everyone knows those are
  // fake" is not a mechanism (see reserved-numbers.ts).
  if (isReservedTestNumber(input.phone)) {
    return { permitted: false, layer: 'reserved', reason: 'reserved_test_number', detail: RESERVED_TEST_REASON }
  }

  // 2. RESOLUTION. No country means no applicable law, and an unknown
  // jurisdiction is a stop rather than a shrug.
  const j = resolveJurisdiction(input.phone)
  if (!j.ok) {
    return { permitted: false, layer: 'resolution', reason: j.reason, detail: REFUSAL_MEANS[j.reason] }
  }

  // 3. SUPPRESSION. Permanent, and checked before anything that could permit.
  if (input.consent?.state === 'objected') {
    return {
      permitted: false,
      layer: 'suppression',
      reason: 'objected',
      detail: 'This contact objected. Permanent, across campaigns, and never overturned by a later consent.',
    }
  }

  // 4. BASIS. What the ledger says, translated into the segment the policy
  // speaks in. `claimed_unevidenced` and `undetermined` are different facts
  // about the world and the same fact here: no basis to send. They are kept
  // distinct in the DETAIL, because one is worth asking the agency about.
  const segment: Segment = segmentFor(input.consent)

  if (segment === 'D') {
    const claimed = input.consent?.state === 'claimed_unevidenced'
    return {
      permitted: false,
      layer: 'basis',
      reason: 'no_ledger_basis',
      detail: claimed
        ? 'An unevidenced claim exists — the agency asserted something we cannot use. Worth asking them to confirm; not a basis to send.'
        : 'Nothing has ever been recorded about this contact, so there is no basis to send.',
    }
  }

  // 5a. THE ROW MUST BE FOR THE COUNTRY WE RESOLVED.
  // The gate is handed a policy row by its caller, and until now it trusted
  // that the caller looked up the right one. A bulk evaluator that picked rows
  // by dialling prefix would hand a Guernsey number the United Kingdom's row —
  // +44 is four jurisdictions — and this function would have evaluated a GG
  // contact under PECR and permitted it. Exactly the defect the resolver was
  // built to prevent, re-entering through the caller.
  //
  // So the gate checks rather than trusts. A caller that looks up correctly
  // never sees this branch; a caller that does not gets a refusal instead of a
  // wrong permission.
  if (input.policy && input.policy.country !== j.country) {
    return {
      permitted: false,
      layer: 'policy',
      reason: 'policy_country_mismatch',
      detail:
        `The policy row supplied is for ${input.policy.country}, but this number resolves to ` +
        `${j.country}. A row for the wrong country cannot authorise anything — +44 alone covers ` +
        'the United Kingdom, Guernsey, Jersey and the Isle of Man.',
    }
  }

  // 5. POLICY. What this country permits for that basis.
  const v = evaluatePolicy(input.policy, segment, {
    consentOccurredAt: input.consent?.occurred_at ?? null,
    now: input.now,
  })
  if (!v.permitted) {
    return { permitted: false, layer: 'policy', reason: v.reason, detail: v.detail }
  }

  // The permission states its grounds and carries its conditions (§11).
  return {
    permitted: true,
    basis: `${v.basis} · ${j.country}`,
    obligations: v.obligationCodes,
    evidence: {
      country: j.country,
      segment,
      consentEventId: input.consent?.event_id ?? null,
      consentOccurredAt: input.consent?.occurred_at ?? null,
      policyConfirmedAt: input.policy!.confirmed_at!,
      policyConfirmedBy: input.policy!.confirmed_by!,
    },
  }
}

/** Every refusal the gate can produce, with wording, for the operator screen. */
export const GATE_REFUSAL_MEANS: Record<string, string> = {
  ...REFUSAL_MEANS,
  ...POLICY_REFUSAL_MEANS,
  reserved_test_number: RESERVED_TEST_REASON,
  objected: 'This contact objected. Permanent and across campaigns.',
  no_ledger_basis: 'Nothing in the ledger permits contacting this person.',
  policy_country_mismatch:
    'The policy row supplied is for a different country than the number resolves to. A row for the wrong country cannot authorise anything.',
}
