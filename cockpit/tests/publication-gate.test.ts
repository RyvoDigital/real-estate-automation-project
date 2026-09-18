import test from 'node:test'
import assert from 'node:assert/strict'

import {
  REFUSAL_MEANS, clearanceStillHolds, decidePublication,
  type PublicationRefusal, type PublicationSubject,
} from '../src/lib/publication/gate'

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

/** Impeccable. Each test breaks exactly one thing. */
const good = (over: Partial<PublicationSubject> = {}): PublicationSubject => ({
  listingId: 'A-1042',
  status: 'available',
  price: 1_950_000,
  fromTheAgency: true,
  energyClass: 'B',
  energyCertificateExpiresAt: '2031-01-01',
  energyExemption: null,
  amiLicence: 'AMI 12345',
  ...over,
})

test('a complete property is cleared, and the evidence travels with it', () => {
  // The neighbour, first. Every refusal below is worthless without it.
  const v = decidePublication(good(), NOW)
  assert.equal(v.cleared, true)
  if (!v.cleared) return
  // The facts are SNAPSHOT because they must appear in the published piece.
  // Re-reading them later is how a piece goes out carrying a different
  // certificate from the one that cleared it.
  assert.equal(v.evidence.energyClass, 'B')
  assert.equal(v.evidence.amiLicence, 'AMI 12345')
  assert.equal(v.evidence.energyCertificateExpiresAt, '2031-01-01')
  assert.equal(v.evidence.listingId, 'A-1042')
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
    good({ status: 'sold', energyClass: null, amiLicence: null }), NOW,
  )
  assert.equal(v.cleared ? '' : v.reason, 'not_on_the_market')
})

test('🔴 no energy rating, no advertisement', () => {
  for (const energyClass of [null, '', '   ']) {
    const v = decidePublication(good({ energyClass, energyCertificateExpiresAt: null }), NOW)
    assert.equal(v.cleared, false)
    if (v.cleared) continue
    assert.equal(v.reason, 'no_energy_class')
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
  const v = decidePublication(good({ energyCertificateExpiresAt: '2026-03-01' }), NOW)
  assert.equal(v.cleared, false)
  if (v.cleared) return
  assert.equal(v.reason, 'certificate_expired')
  assert.match(v.detail, /2026-03-01/, 'it says WHEN, or nobody can act on it')
})

test('a certificate expiring today is still valid today', () => {
  // Valid "until the 30th" means valid ON the 30th. Being stricter than the law
  // refuses a property the agency may lawfully advertise — which is the
  // direction that makes an agency stop using the system.
  const v = decidePublication(good({ energyCertificateExpiresAt: '2026-09-18' }), NOW)
  assert.equal(v.cleared, true)
  const yesterday = decidePublication(good({ energyCertificateExpiresAt: '2026-09-17' }), NOW)
  assert.equal(yesterday.cleared, false)
})

test('a rating with no expiry date is refused — one we cannot date is one we cannot defend', () => {
  // 0028 refuses this shape at the database. Reaching here means the value came
  // from somewhere that constraint did not cover, and refusing is the only safe
  // reading.
  const v = decidePublication(good({ energyCertificateExpiresAt: null }), NOW)
  assert.equal(v.cleared ? '' : v.reason, 'certificate_expired')
})

test('🔴 an exemption stands in for the rating — but only a complete one', () => {
  const complete = { declaredBy: 'A. Ferreira', basis: 'Imóvel em ruína, sem uso', at: '2026-09-18' }
  const v = decidePublication(
    good({ energyClass: null, energyCertificateExpiresAt: null, energyExemption: complete }), NOW,
  )
  assert.equal(v.cleared, true, 'a legitimately exempt property must be publishable')
  if (v.cleared) assert.deepEqual(v.evidence.exemption, complete)

  // A declaration without an author or a reason is a blank cheque. If this were
  // accepted, the exemption becomes the door everything walks through and the
  // obligation has no practical effect at all.
  for (const broken of [
    { declaredBy: '', basis: 'x', at: '2026-09-18' },
    { declaredBy: 'A. Ferreira', basis: '', at: '2026-09-18' },
    { declaredBy: '  ', basis: '  ', at: '2026-09-18' },
  ]) {
    const r = decidePublication(
      good({ energyClass: null, energyCertificateExpiresAt: null, energyExemption: broken }), NOW,
    )
    assert.equal(r.cleared, false, JSON.stringify(broken))
    if (!r.cleared) assert.equal(r.reason, 'no_energy_class')
  }
})

test('an exempt property does not expire, because it has nothing to expire', () => {
  const exemption = { declaredBy: 'A. Ferreira', basis: 'Sem uso', at: '2020-01-01' }
  assert.equal(clearanceStillHolds({
    listingId: 'x', energyClass: null, energyCertificateExpiresAt: null,
    exemption, amiLicence: 'AMI 1', decidedAt: '2020-01-01T00:00:00Z',
  }, NOW), true)
})

test('🔴 no AMI licence, nothing publishes for that agency at all', () => {
  for (const amiLicence of [null, '', '  ']) {
    const v = decidePublication(good({ amiLicence }), NOW)
    assert.equal(v.cleared, false)
    if (!v.cleared) assert.equal(v.reason, 'no_ami_licence')
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
    listingId: 'A-1042', energyClass: 'B', energyCertificateExpiresAt: '2026-12-31',
    exemption: null, amiLicence: 'AMI 12345', decidedAt: '2026-09-18T12:00:00Z',
  }
  // Cleared in September and still true.
  assert.equal(clearanceStillHolds(evidence, NOW), true)
  // Same clearance, same data, nobody acted — and it has stopped being true.
  assert.equal(clearanceStillHolds(evidence, new Date('2027-01-05T12:00:00Z')), false)
})

test('every refusal says what it means, and none of them says "invalid"', () => {
  const reasons: PublicationRefusal[] = [
    'not_on_the_market', 'no_energy_class', 'certificate_expired',
    'no_ami_licence', 'not_from_the_agency',
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
  const refused = decidePublication(good({ amiLicence: null }), NOW)
  assert.equal(refused.cleared, false)
  if (refused.cleared) return
  assert.ok('reason' in refused && 'detail' in refused)
  const ok = decidePublication(good(), NOW)
  assert.ok(ok.cleared && 'evidence' in ok)
})
