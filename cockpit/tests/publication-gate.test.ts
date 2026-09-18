import test from 'node:test'
import assert from 'node:assert/strict'

import {
  REFUSAL_MEANS, clearanceStillHolds, decidePublication,
  type PublicationRefusal, type PublicationSubject,
} from '../src/lib/publication/gate'
import type { PolicyRow } from '../src/lib/publication/requirements'

/**
 * The publication gate — §8.A, and the five things an advertisement may not
 * lack.
 *
 * Every refusal is tested on a subject that is impeccable in every other way,
 * so a passing case cannot be passing for an unrelated reason. And the
 * NEIGHBOUR is tested too: a gate that refused everything would pass every
 * refusal case here identically (§7b).
 */

const NOW = new Date('2026-09-18T12:00:00Z')

/**
 * Portugal, confirmed — so these tests are about the GATE and not about
 * resolution, which requirements.test.ts covers on its own.
 */
const PT: PolicyRow[] = [{
  country: 'PT', region: null, regions_exhaustive: true, region_required: false,
  confirmed_at: '2026-09-18T00:00:00Z', confirmed_by: 'M. de Sousa Pereira',
  requires: [
    { id: 'pt_energy_class', kind: 'property_rating', shape: 'single_letter', exemptible: true },
    { id: 'pt_ami', kind: 'agency_registration', scope: 'national', revocable: true },
  ],
}]

/** Impeccable. Each test breaks exactly one thing. */
const good = (over: Partial<PublicationSubject> = {}): PublicationSubject => ({
  listingId: 'A-1042',
  status: 'available',
  price: 1_950_000,
  fromTheAgency: true,
  country: 'PT',
  region: null,
  policy: PT,
  propertyFacts: [{
    requirementId: 'pt_energy_class',
    values: { class: 'B' },
    certificateNumber: 'CE-1',
    validUntil: '2031-01-01',
    registrationStatus: 'not_required',
    exemption: null,
  }],
  agencyFacts: [{
    requirementId: 'pt_ami', country: 'PT', region: null,
    number: 'AMI 12345', status: 'valid', statusCheckedAt: '2026-09-01T00:00:00Z',
  }],
  ...over,
})

/** Change one property fact without restating the rest. */
const rating = (over: Record<string, unknown>) =>
  ({ propertyFacts: [{ ...good().propertyFacts[0], ...over }] })
const registration = (over: Record<string, unknown>) =>
  ({ agencyFacts: [{ ...good().agencyFacts[0], ...over }] })

test('a complete property is cleared, and the evidence travels with it', () => {
  // The neighbour, first. Every refusal below is worthless without it.
  const v = decidePublication(good(), NOW)
  assert.equal(v.cleared, true)
  if (!v.cleared) return
  // The facts are SNAPSHOT because they must appear in the published piece.
  // Re-reading them later is how a piece goes out carrying a different
  // certificate from the one that cleared it.
  const cls = v.evidence.satisfied.find((r) => r.requirementId === 'pt_energy_class')
  const ami = v.evidence.satisfied.find((r) => r.requirementId === 'pt_ami')
  assert.deepEqual(cls?.values, { class: 'B' })
  assert.equal(cls?.validUntil, '2031-01-01')
  assert.equal(ami?.number, 'AMI 12345')
  assert.equal(v.evidence.listingId, 'A-1042')
  assert.equal(v.evidence.country, 'PT')
  assert.ok(v.evidence.decidedAt)
})

test('a property that is not on the market is refused before anything else', () => {
  for (const status of ['reserved', 'under_offer', 'sold', 'withdrawn']) {
    const v = decidePublication(good({ status }), NOW)
    assert.equal(v.cleared, false, status)
    if (v.cleared) continue
    assert.equal(v.reason, 'not_on_the_market')
  }
  // And the ORDER: a sold property with no certificate and no licence is
  // refused for being sold, not for the paperwork. A refusal must name the
  // first thing wrong, or an operator fixes the wrong thing.
  const v = decidePublication(
    good({ status: 'sold', propertyFacts: [], agencyFacts: [] }), NOW,
  )
  assert.equal(v.cleared ? '' : v.reason, 'not_on_the_market')
})

test('🔴 no energy rating, no advertisement', () => {
  for (const facts of [[], [{ ...good().propertyFacts[0], values: {} }]]) {
    const v = decidePublication(good({ propertyFacts: facts }), NOW)
    assert.equal(v.cleared, false)
    if (v.cleared) continue
    assert.equal(v.reason, 'requirement_unmet')
    assert.equal(v.requirementId, 'pt_energy_class', 'it names WHICH requirement')
    // The operator has to go back to an agency and ask for something. The figure
    // is what makes that conversation happen — and it must be the COMPANY range.
    // §8.A said €250–€3,741 until 18 Sep 2026; that is the range for
    // individuals, and our clients are companies. Understating the consequence
    // twelvefold is the opposite of what this sentence is for.
    assert.match(v.detail, /€2,500 to €44,890/)
    assert.doesNotMatch(v.detail, /3,741/, 'the individual range must never be quoted to a company')
  }
})

test('🔴 an expired certificate is an absent one', () => {
  // Nothing about the property changed. The clock moved.
  const v = decidePublication(good(rating({ validUntil: '2026-03-01' })), NOW)
  assert.equal(v.cleared, false)
  if (v.cleared) return
  assert.equal(v.reason, 'requirement_fact_expired')
  assert.match(v.detail, /2026-03-01/, 'it says WHEN, or nobody can act on it')
})

test('a certificate expiring today is still valid today', () => {
  // Valid "until the 30th" means valid ON the 30th. Being stricter than the law
  // refuses a property the agency may lawfully advertise — which is the
  // direction that makes an agency stop using the system.
  const v = decidePublication(good(rating({ validUntil: '2026-09-18' })), NOW)
  assert.equal(v.cleared, true)
  const yesterday = decidePublication(good(rating({ validUntil: '2026-09-17' })), NOW)
  assert.equal(yesterday.cleared, false)
})

test('a rating with no expiry date is refused — one we cannot date is one we cannot defend', () => {
  // 0028 refuses this shape at the database. Reaching here means the value came
  // from somewhere that constraint did not cover, and refusing is the only safe
  // reading.
  const v = decidePublication(good(rating({ validUntil: null })), NOW)
  assert.equal(v.cleared ? '' : v.reason, 'requirement_fact_expired')
})

test('🔴 an exemption stands in for the rating — but only a complete one', () => {
  const complete = { declared_by: 'A. Ferreira', basis: 'Imóvel em ruína, sem uso', at: '2026-09-18' }
  const v = decidePublication(good(rating({ values: {}, validUntil: null, exemption: complete })), NOW)
  assert.equal(v.cleared, true, 'a legitimately exempt property must be publishable')
  if (v.cleared) {
    assert.deepEqual(
      v.evidence.satisfied.find((r) => r.requirementId === 'pt_energy_class')?.exemption, complete)
  }

  // A declaration without an author or a reason is a blank cheque. If this were
  // accepted, the exemption becomes the door everything walks through and the
  // obligation has no practical effect at all.
  for (const broken of [
    { declared_by: '', basis: 'x', at: '2026-09-18' },
    { declared_by: 'A. Ferreira', basis: '', at: '2026-09-18' },
    { declared_by: '  ', basis: '  ', at: '2026-09-18' },
  ]) {
    const r = decidePublication(good(rating({ values: {}, validUntil: null, exemption: broken })), NOW)
    assert.equal(r.cleared, false, JSON.stringify(broken))
    if (!r.cleared) assert.equal(r.reason, 'requirement_unmet')
  }
})

test('an exempt property does not expire, because it has nothing to expire', () => {
  const exemption = { declared_by: 'A. Ferreira', basis: 'Sem uso', at: '2020-01-01' }
  assert.equal(clearanceStillHolds({
    listingId: 'x', country: 'PT', region: null, decidedAt: '2020-01-01T00:00:00Z',
    satisfied: [{ requirementId: 'pt_energy_class', kind: 'property_rating',
                  values: {}, number: null, validUntil: null, exemption }],
  }, NOW), true)
})

test('🔴 no AMI licence, nothing publishes for that agency at all', () => {
  const v = decidePublication(good({ agencyFacts: [] }), NOW)
  assert.equal(v.cleared, false)
  if (!v.cleared) {
    assert.equal(v.reason, 'requirement_unmet')
    assert.equal(v.requirementId, 'pt_ami')
  }
})

test('🔴 a price the system produced is not the agency’s price', () => {
  // A PROVENANCE check, not a data-quality one. §8.A: the automation does not
  // generate characteristics, prices or availability. A figure we computed,
  // rounded or converted is this system making a claim about somebody else's
  // property.
  assert.equal(decidePublication(good({ fromTheAgency: false }), NOW).cleared, false)
  const v = decidePublication(good({ price: null }), NOW)
  assert.equal(v.cleared ? '' : v.reason, 'not_from_the_agency')
})

test('publication is a state, not a moment', () => {
  const evidence = {
    listingId: 'A-1042', country: 'PT', region: null, decidedAt: '2026-09-18T12:00:00Z',
    satisfied: [{ requirementId: 'pt_energy_class', kind: 'property_rating' as const,
                  values: { class: 'B' }, number: null,
                  validUntil: '2026-12-31', exemption: null }],
  }
  // Cleared in September and still true.
  assert.equal(clearanceStillHolds(evidence, NOW), true)
  // Same clearance, same data, nobody acted — and it has stopped being true.
  assert.equal(clearanceStillHolds(evidence, new Date('2027-01-05T12:00:00Z')), false)
})

test('every refusal says what it means, and none of them says "invalid"', () => {
  const reasons: PublicationRefusal[] = [
    'not_on_the_market', 'requirement_unmet', 'requirement_not_exemptible',
    'requirement_fact_expired', 'requirement_fact_unregistered',
    'requirement_fact_revoked', 'not_from_the_agency',
    'no_policy_row', 'policy_not_confirmed', 'region_undeclared', 'region_not_enumerated',
  ]
  for (const r of reasons) {
    assert.ok(REFUSAL_MEANS[r], `${r} has no words`)
    assert.ok(REFUSAL_MEANS[r].length > 80, `${r} is too short to act on`)
    assert.doesNotMatch(REFUSAL_MEANS[r], /invalid|error|failed|null/i, r)
  }
})

test('the verdict is never a boolean', () => {
  // engineering-lessons §11. A permission carries the facts the published piece
  // must state; a refusal carries which check refused and wording a human can
  // act on. `cleared: false` alone would make the caller guess.
  const refused = decidePublication(good({ agencyFacts: [] }), NOW)
  assert.equal(refused.cleared, false)
  if (refused.cleared) return
  assert.ok('reason' in refused && 'detail' in refused)
  const ok = decidePublication(good(), NOW)
  assert.ok(ok.cleared && 'evidence' in ok)
})

// ---------------------------------------------------------------------------
// ⚠️ THE THREE BELOW WERE UNTESTED, AND I PREDICTED THEY WOULD BE.
//
// A sabotage matrix asked what breaks if each is removed, and for all three the
// prediction was "nothing" — which lesson 1l says is the one prediction that
// must be investigated rather than confirmed, because an empty expectation
// cannot disagree with anything and reads as the strongest result in the table.
//
// All three are the SPANISH cases the whole redesign exists for, and all three
// were reachable only through code nothing exercised. Written down as the
// lesson says: do not write the empty set, write the test that makes it
// non-empty.
// ---------------------------------------------------------------------------

test('🔴 an exemption against a requirement the jurisdiction does not allow to be exempted', () => {
  // Whether a requirement is exemptible is the JURISDICTION's answer. Portugal
  // permits one for the energy rating; §8.A.3 gives no such answer for Spain,
  // and the honest default there is false — an exemption nobody has confirmed
  // exists is one we must not offer.
  //
  // The declaration is still kept: it is a statement somebody at the agency
  // made, and deleting it because we cannot use it would destroy a record.
  const notExemptible: PolicyRow[] = [{
    ...PT[0],
    requires: [{ id: 'pt_energy_class', kind: 'property_rating', exemptible: false }],
  }]
  const v = decidePublication(good({
    policy: notExemptible,
    agencyFacts: [],
    ...rating({ values: {}, validUntil: null,
                exemption: { declared_by: 'A. Ferreira', basis: 'Em ruína, sem uso', at: '2026-09-18' } }),
  }), NOW)
  assert.equal(v.cleared, false)
  if (v.cleared) return
  assert.equal(v.reason, 'requirement_not_exemptible')
  assert.equal(v.requirementId, 'pt_energy_class')
  assert.match(v.detail, /declaration is kept/, 'the record survives even though it cannot be used')
})

test('🔴 a suspended or cancelled registration refuses, and says which', () => {
  // IMPIC suspends and cancels and publishes the list. A licence in our record
  // is not a licence valid today — the certificate problem in a second place.
  for (const status of ['suspended', 'cancelled'] as const) {
    const v = decidePublication(good(registration({ status })), NOW)
    assert.equal(v.cleared, false, status)
    if (v.cleared) continue
    assert.equal(v.reason, 'requirement_fact_revoked')
    assert.match(v.detail, new RegExp(status), 'suspended and cancelled are not the same news')
  }

  // And the neighbours: 'valid' clears, and so does 'unknown' — a typed
  // registration is the agency asserting their own licence number, and no
  // register lookup exists yet. Refusing it would refuse lawful advertisements
  // until we build something we have not built. The staleness of an 'unknown'
  // belongs to the standing re-check as a notice, not to the gate as a refusal.
  assert.equal(decidePublication(good(registration({ status: 'valid' })), NOW).cleared, true)
  assert.equal(
    decidePublication(good(registration({ status: 'unknown', statusCheckedAt: null })), NOW).cleared,
    true,
  )
})

test('🔴 a Catalan registration does not satisfy Valencia, and neither satisfies a national rule', () => {
  // The case the whole redesign exists for. Registration in one region does not
  // carry to another, and a regional registration must not quietly satisfy a
  // national obligation either.
  const ES: PolicyRow[] = [
    { country: 'ES', region: null, regions_exhaustive: true, region_required: true,
      confirmed_at: '2026-09-18T00:00:00Z', confirmed_by: 'counsel', requires: [] },
    { country: 'ES', region: 'CT', regions_exhaustive: false, region_required: false,
      confirmed_at: '2026-09-18T00:00:00Z', confirmed_by: 'counsel',
      requires: [{ id: 'es_cat_aicat', kind: 'agency_registration', scope: 'regional' }] },
    { country: 'ES', region: 'VC', regions_exhaustive: false, region_required: false,
      confirmed_at: '2026-09-18T00:00:00Z', confirmed_by: 'counsel',
      requires: [{ id: 'es_cat_aicat', kind: 'agency_registration', scope: 'regional' }] },
  ]
  const catalan = {
    requirementId: 'es_cat_aicat', country: 'ES', region: 'CT',
    number: 'AICAT 1234', status: 'valid' as const, statusCheckedAt: '2026-09-01T00:00:00Z',
  }
  const inES = (region: string, agencyFacts = [catalan]) =>
    decidePublication(good({
      country: 'ES', region, policy: ES, agencyFacts,
      ...rating({ requirementId: 'x' }),
    }), NOW)

  assert.equal(inES('CT').cleared, true, 'the registration they hold, in the region they hold it for')

  const valencia = inES('VC')
  assert.equal(valencia.cleared, false, 'a Catalan number does not satisfy Valencia')
  if (!valencia.cleared) assert.equal(valencia.reason, 'requirement_unmet')

  // And the national direction: a regional registration must not satisfy a
  // requirement scoped nationally, or a Catalan number would quietly discharge
  // a country-wide obligation.
  const national: PolicyRow[] = [{
    ...ES[0], region_required: false,
    requires: [{ id: 'es_cat_aicat', kind: 'agency_registration', scope: 'national' }],
  }]
  const v = decidePublication(good({
    country: 'ES', region: null, policy: national, agencyFacts: [catalan],
    ...rating({ requirementId: 'x' }),
  }), NOW)
  assert.equal(v.cleared, false, 'a regional registration is not a national one')
})
