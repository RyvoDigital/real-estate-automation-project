/**
 * May this property be advertised at all?
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ A DIFFERENT QUESTION FROM THE CONSENT GATE, ABOUT A DIFFERENT SUBJECT.  │
 * │                                                                         │
 * │ `decideGate` asks about the RECIPIENT — may we message this person? —   │
 * │ from consent, jurisdiction and suppression. This asks about the         │
 * │ PROPERTY, from the energy certificate and the agency's licence (§8.A).  │
 * │                                                                         │
 * │ Neither is evidence of the other. A property with no certificate may    │
 * │ not be advertised to a perfectly consented contact, and a perfectly     │
 * │ documented property may not be advertised to somebody who objected.     │
 * │                                                                         │
 * │ tests/two-gates.test.ts holds that boundary as a source-level check,    │
 * │ and it was written BEFORE this file existed.                            │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * WHAT THE LAW REQUIRES, AND WHO PAYS
 *
 * Since 2013 every sale or rental advertisement in Portugal must state the
 * energy rating; the AMI licence number must appear in all of an agency's
 * publicity (Lei n.º 15/2013, IMPIC). Fines are €250–€3,741 and fall on
 * whoever puts the property on the market — which can be the mediator, so on
 * our client. Same shape as Meta category misuse: our defect, their penalty,
 * their regulator.
 *
 * THIS FILE HOLDS NO IO AND NO `server-only`, DELIBERATELY — the same call
 * `gate.ts` makes and for the same reason. A gate whose decision cannot be
 * tested without a database is a gate tested one layer at a time, and the layer
 * ORDER is the part most worth proving.
 */

export type PublicationRefusal =
  | 'not_on_the_market'
  | 'no_energy_class'
  | 'certificate_expired'
  | 'no_ami_licence'
  | 'not_from_the_agency'

/**
 * What a refusal MEANS, in words an operator can act on.
 *
 * Never "invalid" and never a code alone: this is read by somebody who has to
 * go back to an agency and ask them for something, and "no_energy_class" is not
 * a sentence anybody can act on.
 */
export const REFUSAL_MEANS: Record<PublicationRefusal, string> = {
  not_on_the_market:
    'This property is not available, so it must not be advertised. Advertising something ' +
    'that is sold or under offer is the worst output this system can produce: the damage ' +
    'lands on the agency in front of their own customer.',
  no_energy_class:
    'Every sale or rental advertisement in Portugal has had to state the energy rating since ' +
    '2013. There is none recorded for this property and no exemption has been declared, so ' +
    'publishing it would expose the agency to a fine of €250 to €3,741.',
  certificate_expired:
    'The energy certificate has expired. An expired certificate counts as an absent one, so ' +
    'this property cannot be advertised until a current certificate is recorded — even though ' +
    'nothing about the property has changed.',
  no_ami_licence:
    'This agency has no AMI licence number on record. It must appear in all of their publicity ' +
    'and documentation, so nothing can be published for them until it is recorded once.',
  not_from_the_agency:
    'The price or the description did not come from the agency. This system never generates or ' +
    'infers what a property costs or what it has — it publishes what the agency supplied, with ' +
    'the mandatory statements, and refuses when something is missing.',
}

/** An exemption is a person saying so, with their name and their reason. */
export type EnergyExemption = { declaredBy: string; basis: string; at: string }

export type PublicationSubject = {
  listingId: string
  status: string
  price: number | null
  /** What the agency supplied. Never computed, rounded, converted or inferred. */
  fromTheAgency: boolean
  energyClass: string | null
  energyCertificateExpiresAt: string | null
  energyExemption: EnergyExemption | null
  amiLicence: string | null
}

export type PublicationVerdict =
  | {
      cleared: true
      /**
       * SNAPSHOT — the facts as they were when cleared, because these are what
       * must appear in the published piece. Re-reading them later is how a
       * piece goes out carrying a different certificate from the one that
       * cleared it.
       */
      evidence: {
        listingId: string
        energyClass: string | null
        energyCertificateExpiresAt: string | null
        exemption: EnergyExemption | null
        amiLicence: string
        decidedAt: string
      }
    }
  | { cleared: false; reason: PublicationRefusal; detail: string }

/** Only `available` may be advertised — the same allow-list `0009` argues for. */
const ADVERTISABLE = 'available'

/**
 * Checked in order, cheapest and most absolute first, so a refusal names the
 * FIRST thing wrong rather than the last — and a property that is not even on
 * the market is refused before anybody's certificate is looked up.
 */
export function decidePublication(
  s: PublicationSubject,
  now: Date = new Date(),
): PublicationVerdict {
  const no = (reason: PublicationRefusal, extra = ''): PublicationVerdict => ({
    cleared: false,
    reason,
    detail: `${REFUSAL_MEANS[reason]}${extra ? ` ${extra}` : ''}`,
  })

  // 1 ----------------------------------------------------------------
  if (s.status !== ADVERTISABLE) return no('not_on_the_market', `It is ${s.status}.`)

  // 2 ----------------------------------------------------------------
  // An exemption stands in for the rating, and ONLY a complete one: a
  // declaration without an author or a reason is a blank cheque, not a
  // declaration. `0028` refuses the incomplete shape at the database too —
  // this is the same rule where the decision is made, because a value can
  // reach here from somewhere the constraint never saw.
  const exempt =
    s.energyExemption !== null &&
    Boolean(s.energyExemption.declaredBy?.trim()) &&
    Boolean(s.energyExemption.basis?.trim())

  if (!exempt && !s.energyClass?.trim()) return no('no_energy_class')

  // 3 ----------------------------------------------------------------
  // "Um certificado caducado é tratado como ausente." Not a warning, not a
  // soft state: the same refusal as having none, reached by a clock rather
  // than by a missing field.
  //
  // An exempt property has no certificate to expire, so this is skipped for
  // one — but a property with BOTH a rating and an expiry is judged on the
  // expiry regardless, because the rating is the thing the date qualifies.
  if (!exempt) {
    const until = s.energyCertificateExpiresAt
    // `0028` refuses a class with no expiry, so reaching here without one means
    // the value came from somewhere that constraint did not cover. Refusing is
    // the only safe reading: a rating we cannot date is one we cannot defend.
    if (!until) return no('certificate_expired', 'No expiry date is recorded for it.')
    const t = new Date(until).getTime()
    if (!Number.isFinite(t)) return no('certificate_expired', 'Its expiry date cannot be read.')
    // End of the day it expires, not the start — a certificate valid "until the
    // 30th" is valid on the 30th, and being stricter than the law here would
    // refuse a property the agency may lawfully advertise.
    if (t + 86_400_000 <= now.getTime()) {
      return no('certificate_expired', `It expired on ${until}.`)
    }
  }

  // 4 ----------------------------------------------------------------
  const ami = s.amiLicence?.trim()
  if (!ami) return no('no_ami_licence')

  // 5 ----------------------------------------------------------------
  // §8.A: "A automação não gera características, preços ou disponibilidades."
  // A PROVENANCE check rather than a data-quality one. A price the system
  // computed, rounded or converted is not the agency's price, and publishing
  // it is this system making a claim about somebody else's property.
  if (!s.fromTheAgency) return no('not_from_the_agency')
  if (s.price === null) return no('not_from_the_agency', 'No price was supplied.')

  return {
    cleared: true,
    evidence: {
      listingId: s.listingId,
      energyClass: exempt ? null : (s.energyClass as string).trim(),
      energyCertificateExpiresAt: exempt ? null : s.energyCertificateExpiresAt,
      exemption: exempt ? s.energyExemption : null,
      amiLicence: ami,
      decidedAt: now.toISOString(),
    },
  }
}

/**
 * Is a clearance still good?
 *
 * PUBLICATION IS A STATE, NOT A MOMENT. A certificate expires, so a clearance
 * decided in March stops being true in December with nobody having acted. The
 * dispatcher re-reads it for this reason and the standing re-check exists for
 * this reason, and the general form is worth keeping: **a permission that can
 * expire without anyone acting is one that has to be re-asked rather than
 * granted.**
 */
export function clearanceStillHolds(
  evidence: Extract<PublicationVerdict, { cleared: true }>['evidence'],
  now: Date = new Date(),
): boolean {
  if (evidence.exemption) return true
  const until = evidence.energyCertificateExpiresAt
  if (!until) return false
  const t = new Date(until).getTime()
  return Number.isFinite(t) && t + 86_400_000 > now.getTime()
}
