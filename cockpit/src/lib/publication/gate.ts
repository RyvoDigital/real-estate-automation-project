import {
  RESOLUTION_MEANS, resolveRequirements,
  type PolicyRow, type Requirement, type ResolutionRefusal,
} from './requirements'

/**
 * May this property be advertised at all?
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ A DIFFERENT QUESTION FROM THE CONSENT GATE, ABOUT A DIFFERENT SUBJECT.  │
 * │                                                                         │
 * │ `decideGate` asks about the RECIPIENT — may we message this person? —   │
 * │ from consent, jurisdiction and suppression. This asks about the         │
 * │ PROPERTY, from what the jurisdiction where it SITS requires.            │
 * │                                                                         │
 * │ tests/two-gates.test.ts holds that boundary as a source-level check,    │
 * │ and it was written BEFORE this file existed.                            │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠️ IT NO LONGER KNOWS WHAT PORTUGAL REQUIRES.
 *
 * The first version read `energyClass` and `amiLicence` by name, which was
 * Portugal's answer mistaken for the question. Spain answers with TWO ratings
 * whose validity comes from registration with one of seventeen regional
 * registers, plus an agency registration that is mandatory in two regions and
 * absent in most. A Barcelona property carries a requirement the same agency's
 * Zaragoza property does not.
 *
 * So the gate asks `resolveRequirements` what this property's jurisdiction
 * requires and then asks whether each requirement is satisfied. Adding a
 * country is a row. Adding a requirement shape is a renderer and a test.
 *
 * Pure, and with no `server-only` — the same call `decideGate` makes, for the
 * same reason: the layer ORDER is the part most worth proving and a gate that
 * needs a database to be tested is tested one layer at a time.
 */

export type PropertyFact = {
  requirementId: string
  values: Record<string, unknown>
  certificateNumber: string | null
  validUntil: string | null
  registrationStatus: 'not_required' | 'registered' | 'not_registered' | 'unknown'
  exemption: { declared_by: string; basis: string; at: string } | null
}

export type AgencyFact = {
  requirementId: string
  country: string
  region: string | null
  number: string
  status: 'valid' | 'suspended' | 'cancelled' | 'unknown'
  statusCheckedAt: string | null
}

export type PublicationRefusal =
  | 'not_on_the_market'
  | ResolutionRefusal
  | 'requirement_unmet'
  | 'requirement_not_exemptible'
  | 'requirement_fact_expired'
  | 'requirement_fact_unregistered'
  | 'requirement_fact_revoked'
  | 'not_from_the_agency'

export const REFUSAL_MEANS: Record<PublicationRefusal, string> = {
  not_on_the_market:
    'This property is not available, so it must not be advertised. Advertising something that is ' +
    'sold or under offer is the worst output this system can produce: the damage lands on the ' +
    'agency in front of their own customer.',
  ...RESOLUTION_MEANS,
  requirement_unmet:
    'This jurisdiction requires something of every advertisement and we do not hold it for this ' +
    'property. Publishing without it would expose the agency to a fine of €2,500 to €44,890 — the ' +
    'range for companies, which is what our clients are.',
  requirement_not_exemptible:
    'An exemption has been declared for something this jurisdiction does not allow to be exempted. ' +
    'The declaration is kept — it is a statement somebody at the agency made — but it cannot stand ' +
    'in for the thing itself here.',
  requirement_fact_expired:
    'What we hold has expired. An expired certificate counts as an absent one, so this property ' +
    'cannot be advertised until a current one is recorded — even though nothing about the property ' +
    'has changed and nobody has done anything.',
  requirement_fact_unregistered:
    'The certificate exists and was never lodged with the register that gives it official validity. ' +
    'This is a FILING problem, not an expiry: buying a new certificate would cost the agency money ' +
    'and fix nothing. It has to be registered.',
  requirement_fact_revoked:
    'The agency registration this jurisdiction requires has been suspended or cancelled by the ' +
    'authority that issued it. Nothing can be published under it until that is resolved, and it is ' +
    'resolved with them rather than with us.',
  not_from_the_agency:
    'The price or the description did not come from the agency. This system never generates or ' +
    'infers what a property costs or what it has — it publishes what the agency supplied, with the ' +
    'mandatory statements, and refuses when something is missing.',
}

export type SatisfiedRequirement = {
  requirementId: string
  kind: Requirement['kind']
  /** For a rating: the values. For a registration: {} and `number` is set. */
  values: Record<string, unknown>
  number: string | null
  validUntil: string | null
  exemption: { declared_by: string; basis: string; at: string } | null
}

export type PublicationVerdict =
  | {
      cleared: true
      evidence: {
        listingId: string
        country: string
        region: string | null
        /**
         * SNAPSHOT — what was true when cleared, because these are the facts
         * the published piece must state. Re-reading them later is how a piece
         * goes out carrying a different certificate from the one that cleared
         * it.
         */
        satisfied: SatisfiedRequirement[]
        decidedAt: string
      }
    }
  | { cleared: false; reason: PublicationRefusal; detail: string; requirementId?: string }

export type PublicationSubject = {
  listingId: string
  status: string
  price: number | null
  /** What the agency supplied. Never computed, rounded, converted or inferred. */
  fromTheAgency: boolean
  country: string | null
  region: string | null
  policy: PolicyRow[]
  propertyFacts: PropertyFact[]
  agencyFacts: AgencyFact[]
}

const ADVERTISABLE = 'available'
const DAY = 86_400_000

/** Valid THROUGH the day it expires — the convention every date here uses. */
function stillValid(until: string | null, now: Date): boolean {
  if (!until) return false
  const t = new Date(until).getTime()
  return Number.isFinite(t) && t + DAY > now.getTime()
}

function completeExemption(e: PropertyFact['exemption']): boolean {
  return Boolean(e && e.declared_by?.trim() && e.basis?.trim())
}

export function decidePublication(
  s: PublicationSubject,
  now: Date = new Date(),
): PublicationVerdict {
  const no = (
    reason: PublicationRefusal, extra = '', requirementId?: string,
  ): PublicationVerdict => ({
    cleared: false, reason,
    detail: `${REFUSAL_MEANS[reason]}${extra ? ` ${extra}` : ''}`,
    ...(requirementId ? { requirementId } : {}),
  })

  // 1 -- cheapest and most absolute, before anybody's paperwork is looked up.
  if (s.status !== ADVERTISABLE) return no('not_on_the_market', `It is ${s.status}.`)

  // 2 -- what does this property's jurisdiction require? Until that is known
  //      there is nothing to check anything against.
  const resolution = resolveRequirements({
    country: s.country, region: s.region, rows: s.policy, now,
  })
  if (!resolution.resolved) {
    return { cleared: false, reason: resolution.reason, detail: resolution.detail }
  }

  // 3 -- each requirement, in the order the jurisdiction states them.
  const satisfied: SatisfiedRequirement[] = []
  for (const r of resolution.requirements) {
    const outcome = r.kind === 'property_rating'
      ? checkRating(r, s, now)
      : checkRegistration(r, s, resolution.region)
    if ('refusal' in outcome) {
      return no(outcome.refusal, outcome.extra ?? '', r.id)
    }
    satisfied.push(outcome.satisfied)
  }

  // 4 -- ours rather than the jurisdiction's, and a PROVENANCE check rather
  //      than a data-quality one: a figure the system computed, rounded or
  //      converted is this system making a claim about somebody else's asset.
  if (!s.fromTheAgency) return no('not_from_the_agency')
  if (s.price === null) return no('not_from_the_agency', 'No price was supplied.')

  return {
    cleared: true,
    evidence: {
      listingId: s.listingId,
      country: resolution.country,
      region: resolution.region,
      satisfied,
      decidedAt: now.toISOString(),
    },
  }
}

type Outcome =
  | { satisfied: SatisfiedRequirement }
  | { refusal: PublicationRefusal; extra?: string }

function checkRating(r: Requirement, s: PublicationSubject, now: Date): Outcome {
  const f = s.propertyFacts.find((x) => x.requirementId === r.id)
  if (!f) return { refusal: 'requirement_unmet' }

  if (completeExemption(f.exemption)) {
    // Whether a requirement may be exempted at all is the JURISDICTION's
    // answer, not the property's. The old shape could not express the
    // difference, because it hung the exemption on the listing.
    if (!r.exemptible) return { refusal: 'requirement_not_exemptible' }
    return {
      satisfied: {
        requirementId: r.id, kind: r.kind, values: {}, number: null,
        validUntil: null, exemption: f.exemption,
      },
    }
  }

  if (Object.keys(f.values).length === 0) return { refusal: 'requirement_unmet' }

  if (!stillValid(f.validUntil, now)) {
    return {
      refusal: 'requirement_fact_expired',
      extra: f.validUntil ? `It expired on ${f.validUntil}.` : 'No expiry date is recorded for it.',
    }
  }

  // ⚠️ UNREGISTERED IS NOT EXPIRED, and the refusals are separate because the
  // ACTIONS are: an operator told "expired" goes and buys a new certificate, at
  // the agency's expense, and it does not fix a filing problem.
  if (r.registration === 'required' && f.registrationStatus !== 'registered') {
    return {
      refusal: 'requirement_fact_unregistered',
      extra: r.registered_with ? `It is registered with the ${r.registered_with}.` : '',
    }
  }

  return {
    satisfied: {
      requirementId: r.id, kind: r.kind, values: f.values,
      number: f.certificateNumber, validUntil: f.validUntil, exemption: null,
    },
  }
}

function checkRegistration(r: Requirement, s: PublicationSubject, region: string | null): Outcome {
  // A registration is held FOR a jurisdiction. A Catalan AICAT number does not
  // satisfy Valencia's requirement, so the region has to match — and for a
  // national requirement the fact must NOT be scoped to a region, or a regional
  // registration would quietly satisfy a national obligation.
  const f = s.agencyFacts.find((x) =>
    x.requirementId === r.id &&
    x.country === s.country?.toUpperCase() &&
    (r.scope === 'regional' ? x.region === region : x.region === null))
  if (!f) return { refusal: 'requirement_unmet' }

  if (f.status === 'suspended' || f.status === 'cancelled') {
    return { refusal: 'requirement_fact_revoked', extra: `It is ${f.status}.` }
  }

  /*
   * 'unknown' PASSES HERE, and that is a departure from the design line that
   * said "unknown is not valid" — so it is stated rather than quietly chosen.
   *
   * A typed registration is the agency ASSERTING THEIR OWN LICENCE NUMBER, and
   * no register lookup exists yet (step 7). Refusing `unknown` would mean
   * nothing can be published until a lookup we have not built says otherwise —
   * which refuses lawful advertisements, and that is the direction that makes
   * an agency stop using the system.
   *
   * The design's own next sentence puts the interval in the right place: "after
   * some interval it should SAY SO" — that is the standing re-check producing a
   * notice, not the gate producing a refusal. The gate refuses on facts; decay
   * is surfaced.
   */
  return {
    satisfied: {
      requirementId: r.id, kind: r.kind, values: {}, number: f.number,
      validUntil: null, exemption: null,
    },
  }
}

/**
 * Is a clearance still good?
 *
 * PUBLICATION IS A STATE, NOT A MOMENT. A permission that can expire without
 * anyone acting is one that has to be re-asked rather than granted.
 */
export function clearanceStillHolds(
  evidence: Extract<PublicationVerdict, { cleared: true }>['evidence'],
  now: Date = new Date(),
): boolean {
  return evidence.satisfied.every((r) =>
    r.exemption !== null || r.validUntil === null || stillValid(r.validUntil, now))
}
