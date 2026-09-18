import test from 'node:test'
import assert from 'node:assert/strict'

import {
  WARN_WITHIN_DAYS, STATUS_STALE_AFTER_DAYS, recheckClearances, type ClearanceRow,
} from '../src/lib/publication/recheck'
import type { AgencyFact, SatisfiedRequirement } from '../src/lib/publication/gate'
import type { PolicyRow, Requirement } from '../src/lib/publication/requirements'
import { NOTICE, EXEMPTION, FORBIDDEN_ON_SCREEN } from '../src/lib/matching/screen-copy'
import { exemptionRecord, validateExemption } from '../src/lib/publication/exemption'

/**
 * The standing re-check, the notice, and the exemption declaration.
 *
 * The notice tests are the ones that matter most, and they are about WORDS: we
 * cannot withdraw a post we did not publish, so nothing in this feature may
 * read as though we did something to the advertisement.
 */

const NOW = new Date('2026-09-18T12:00:00Z')
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString().slice(0, 10)

const rating = (over: Partial<SatisfiedRequirement> = {}): SatisfiedRequirement => ({
  requirementId: 'pt_energy_class', kind: 'property_rating',
  values: { class: 'B' }, number: 'CE-1', validUntil: day(400), exemption: null, ...over,
})

const registration = (over: Partial<SatisfiedRequirement> = {}): SatisfiedRequirement => ({
  requirementId: 'pt_ami', kind: 'agency_registration',
  values: {}, number: '12345', validUntil: null, exemption: null, ...over,
})

const row = (over: Partial<ClearanceRow> = {}): ClearanceRow => ({
  clearanceId: Math.random().toString(36).slice(2),
  listingId: 'l1',
  reference: 'A-1042',
  satisfied: [rating()],
  country: 'PT',
  region: null,
  decidedAt: '2026-09-18T00:00:00Z',
  noticeSentAt: null,
  ...over,
})

/** One dated requirement, without restating the rest of the row. */
const expiring = (until: string | null) => ({ satisfied: [rating({ validUntil: until })] })

// --- the re-check -----------------------------------------------------------

test('a clearance lapses without anybody acting', () => {
  // Nothing about the property changed. The clock moved.
  const r = recheckClearances([row(expiring(day(-40)))], { now: NOW })
  assert.equal(r.lapsed.length, 1)
  assert.equal(r.lapsed[0].daysAgo, 40)
  assert.equal(r.stillGood, 0)
})

test('a certificate expiring soon is warned about, not yet lapsed', () => {
  const r = recheckClearances([row(expiring(day(10)))], { now: NOW })
  assert.deepEqual(r.lapsed, [])
  assert.equal(r.expiringSoon.length, 1)
  assert.equal(r.expiringSoon[0].daysLeft, 10)
})

test('an exempt property has nothing to expire and nothing to warn about', () => {
  const r = recheckClearances([row({
    satisfied: [rating({ validUntil: null,
      exemption: { declared_by: 'A. Ferreira', basis: 'Imóvel em ruína, sem uso', at: '2020-01-01' } })],
  })], { now: NOW })
  assert.deepEqual(r.lapsed, [])
  assert.deepEqual(r.expiringSoon, [])
  assert.equal(r.stillGood, 1)
})

test('the longest-lapsed is first, because it has been unlawful longest', () => {
  const r = recheckClearances([
    row({ listingId: 'a', ...expiring(day(-5)) }),
    row({ listingId: 'b', ...expiring(day(-200)) }),
  ], { now: NOW })
  assert.deepEqual(r.lapsed.map((l) => l.listingId), ['b', 'a'])
})

test('having already been told is carried, so a second notice is a choice', () => {
  const r = recheckClearances(
    [row({ ...expiring(day(-40)), noticeSentAt: '2026-09-01T00:00:00Z' })],
    { now: NOW },
  )
  assert.equal(r.lapsed[0].noticeSentAt, '2026-09-01T00:00:00Z')
})

test('nothing to report is reported as nothing, and the totals add up', () => {
  const r = recheckClearances([row(), row(), row(expiring(day(-1)))], { now: NOW })
  assert.equal(r.checked, 3)
  assert.equal(r.lapsed.length + r.expiringSoon.length + r.stillGood, 3,
    'every clearance lands in exactly one bucket')
  assert.equal(WARN_WITHIN_DAYS, 30)
})

// --- 🔴 the three ways a clearance lapses that are not a date on a certificate

const req = (id: string, over: Partial<Requirement> = {}): Requirement =>
  ({ id, kind: 'property_rating', ...over })

const confirmed = { confirmed_at: '2026-09-01T00:00:00Z', confirmed_by: 'M. de Sousa Pereira' }

const policyPT = (over: Partial<PolicyRow> = {}): PolicyRow => ({
  country: 'PT', region: null,
  requires: [req('pt_energy_class'), req('pt_ami', { kind: 'agency_registration', scope: 'national', revocable: true })],
  regions_exhaustive: true, region_required: false, ...confirmed, ...over,
})

const licence = (over: Partial<AgencyFact> = {}): AgencyFact => ({
  requirementId: 'pt_ami', country: 'PT', region: null, number: '12345',
  status: 'valid', statusCheckedAt: day(-10), ...over,
})

/** A clearance granted on both of Portugal's requirements. */
const ptRow = (over: Partial<ClearanceRow> = {}) =>
  row({ satisfied: [rating(), registration()], ...over })

const full = (over = {}) => ({ now: NOW, policy: [policyPT()], agencyFacts: [licence()], ...over })

test('a complete run with everything in order finds nothing and says nothing was skipped', () => {
  const r = recheckClearances([ptRow()], full())
  assert.deepEqual(r.lapsed, [])
  assert.deepEqual(r.toConfirm, [])
  assert.deepEqual(r.notCheckedFor, [], 'it had every input it needed')
  assert.equal(r.stillGood, 1)
})

test('🔴 a licence suspended after the clearance lapses it, and we do NOT know since when', () => {
  // The AMI-as-a-STATE finding arriving in the re-check rather than the gate. A
  // property cleared under a licence since suspended is in exactly the position
  // of one cleared under an expired certificate.
  const r = recheckClearances([ptRow()], full({ agencyFacts: [licence({ status: 'suspended' })] }))
  assert.deepEqual(r.lapsed[0].causes, ['registration_revoked'])
  assert.deepEqual(r.lapsed[0].requirementIds, ['pt_ami'])
  assert.equal(r.stillGood, 0)

  // ⚠️ IMPIC suspended it on a day nobody told us about. The only date we hold
  // is when we last looked, and presenting one as the other would be this
  // system stating a fact about the world that it computed from an absence.
  assert.equal(r.lapsed[0].since, null)
  assert.equal(r.lapsed[0].daysAgo, null, 'null, and NOT 0 — we do not know, and 0 would be a claim')
})

test('a cancelled licence is the same finding as a suspended one', () => {
  const r = recheckClearances([ptRow()], full({ agencyFacts: [licence({ status: 'cancelled' })] }))
  assert.deepEqual(r.lapsed[0].causes, ['registration_revoked'])
})

test('🔴 a requirement that becomes effective lapses what was cleared before it', () => {
  // Madrid. NOBODY EDITS ANYTHING: the region moves to mandatory on a date and
  // properties lawfully advertised yesterday are not today. The obligation
  // arrived rather than the permission lapsing — opposite direction, identical
  // consequence, same notice.
  const policy: PolicyRow[] = [
    { country: 'ES', region: null, requires: [req('es_energy_label')],
      regions_exhaustive: true, region_required: true, ...confirmed },
    { country: 'ES', region: 'MD', requires: [req('es_mad_registro', {
        kind: 'agency_registration', scope: 'regional', effective_from: '2027-01-01' })],
      regions_exhaustive: false, region_required: false, ...confirmed },
  ]
  const madrid = row({
    country: 'ES', region: 'MD',
    satisfied: [rating({ requirementId: 'es_energy_label' })],
  })

  const before = recheckClearances([madrid], { now: NOW, policy, agencyFacts: [] })
  assert.deepEqual(before.lapsed, [], 'not yet mandatory, so nothing to say')
  assert.equal(before.stillGood, 1)

  const after = recheckClearances([madrid], { now: new Date('2027-06-01'), policy, agencyFacts: [] })
  assert.deepEqual(after.lapsed[0].causes, ['requirement_arrived'])
  assert.deepEqual(after.lapsed[0].requirementIds, ['es_mad_registro'])
  // This one DOES date itself, which is the useful difference from a revocation.
  assert.equal(after.lapsed[0].since, '2027-01-01')
  assert.equal(after.lapsed[0].daysAgo, 151)
})

test('🔴 a jurisdiction we can no longer read is OUR uncertainty, not the property being unlawful', () => {
  // A confirmation withdrawn, or a region row added that nobody has confirmed.
  // The property may be perfectly in order. Saying "this is irregular" would
  // send an agency to fix something that is not broken.
  const r = recheckClearances([ptRow()], full({
    policy: [policyPT({ confirmed_at: null, confirmed_by: null })],
  }))
  assert.deepEqual(r.lapsed[0].causes, ['requirement_unresolvable'])
  assert.deepEqual(r.lapsed[0].requirementIds, [], 'we cannot name a requirement we cannot resolve')
  assert.match(NOTICE.causeUnresolvable, /não sabemos/i, 'and the copy says exactly that')
  assert.doesNotMatch(NOTICE.causeUnresolvable, /ilegal|irregular\.|incumpr/i)
})

test('🔴 every applicable cause is reported, never the first one found', () => {
  // An agency told only that the certificate lapsed buys a new certificate, and
  // the licence is still suspended. Reporting one cause and stopping is the
  // fix-the-visible-half family.
  const r = recheckClearances(
    [ptRow({ satisfied: [rating({ validUntil: day(-40) }), registration()] })],
    full({ agencyFacts: [licence({ status: 'suspended' })] }),
  )
  assert.deepEqual(r.lapsed[0].causes.sort(), ['certificate_expired', 'registration_revoked'])
  assert.deepEqual(r.lapsed[0].requirementIds.sort(), ['pt_ami', 'pt_energy_class'])
  assert.equal(r.lapsed[0].daysAgo, 40, 'dated by the cause that has a date')
})

test('a lapse we cannot date sorts after the ones we can, rather than at the top', () => {
  // Treating null as 0 (bottom) or Infinity (top) would both be this system
  // asserting a duration it does not hold. It is simply not orderable.
  const r = recheckClearances([
    ptRow({ listingId: 'undated' }),
    ptRow({ listingId: 'old', satisfied: [rating({ validUntil: day(-200) }), registration()] }),
    ptRow({ listingId: 'recent', satisfied: [rating({ validUntil: day(-5) }), registration()] }),
  ], full({ agencyFacts: [licence({ status: 'cancelled' })] }))
  assert.deepEqual(r.lapsed.map((l) => l.listingId), ['old', 'recent', 'undated'])

  /*
   * ⚠️ AND THE ORDER ALONE DOES NOT PROVE THE NULL IS A NULL. Sabotaging
   * `daysAgo` from null to 0 left this order untouched — a dated lapse is
   * always at least one day old, so zero sorts last exactly where null does,
   * and the assertion above passed on a value that claims we know a duration
   * we do not know.
   *
   * The order is one claim and the absence of a number is another. Both are
   * asserted, because only one of them was.
   */
  assert.equal(r.lapsed[2].daysAgo, null, 'last because we cannot order it, not because it is 0')
  assert.equal(r.lapsed[2].since, null)
})

// --- 🔴 a check that could not run is not a clean bill -----------------------

test('🔴 not being given the policy is recorded as not-checked, NOT as a finding', () => {
  // The first version of this reported every standing clearance as one we could
  // no longer confirm when handed no policy rows — our own missing input
  // arriving on screen as a finding about four hundred properties.
  const r = recheckClearances([ptRow(), ptRow()], { now: NOW })
  assert.deepEqual(r.lapsed, [], 'a missing input is not a finding about the world')
  assert.equal(r.stillGood, 2)
  assert.deepEqual(r.notCheckedFor.sort(),
    ['registration_revoked', 'requirement_arrived', 'requirement_unresolvable'])
})

test('🔴 absent and empty are different, and the difference is the whole safety of it', () => {
  // undefined = we were not asked. [] = we were asked and there are no rows,
  // which is a real state of the world. Collapsing them turns a database read
  // that came back empty into a page of findings, or a check that never ran
  // into a clean bill.
  const notAsked = recheckClearances([ptRow()], { now: NOW })
  const askedAndEmpty = recheckClearances([ptRow()], { now: NOW, policy: [], agencyFacts: [] })

  assert.deepEqual(notAsked.lapsed, [])
  assert.ok(notAsked.notCheckedFor.length > 0)

  assert.deepEqual(askedAndEmpty.lapsed[0].causes, ['requirement_unresolvable'],
    'we hold no policy for a country we have cleared a property in — that IS worth knowing')
  assert.deepEqual(askedAndEmpty.notCheckedFor, [], 'and it was checked, so nothing is owed')
})

test('the policy without the licences leaves the licence question unanswered, not answered no', () => {
  const r = recheckClearances([ptRow()], { now: NOW, policy: [policyPT()] })
  assert.deepEqual(r.lapsed, [], 'the requirement IS held in the snapshot, so nothing arrived')
  assert.deepEqual(r.notCheckedFor, ['registration_revoked'])
  assert.deepEqual(r.toConfirm, [], 'and no licence can be surfaced from facts we were not given')
})

test('the screen is told an incomplete run is incomplete, in words', () => {
  // An empty section reads as "nothing is wrong". When a check could not run,
  // what is true is "nothing was looked at" — opposite meanings, same blank.
  assert.match(NOTICE.notChecked, /não quer dizer que esteja tudo bem/i)
  assert.match(NOTICE.notChecked, /não foi possível/i)
})

// --- 🔴 the stale status: surfaced as a question, never as a refusal ---------

test('🔴 a licence nobody has confirmed lately is surfaced ONCE, keyed by the licence', () => {
  // Keyed by the registration and not the clearance. One agency holds one
  // licence and may have forty cleared properties resting on it; listed per
  // property that is forty identical lines and a notice nobody reads.
  const r = recheckClearances(
    [ptRow({ listingId: 'a' }), ptRow({ listingId: 'b' }), ptRow({ listingId: 'c' })],
    full({ agencyFacts: [licence({ statusCheckedAt: day(-200) })] }),
  )
  assert.equal(r.toConfirm.length, 1, 'one licence, one line')
  assert.equal(r.toConfirm[0].number, '12345')
  assert.equal(r.toConfirm[0].affects, 3)
  assert.equal(r.toConfirm[0].daysSinceChecked, 200)

  // ⚠️ AND IT IS NOT A FAILURE. The gate passes an unconfirmed registration
  // deliberately; this is where that departure is paid for, and paying for it
  // with a refusal would be the thing the departure exists to avoid.
  assert.deepEqual(r.lapsed, [])
  assert.equal(r.stillGood, 3, 'still advertisable, and still worth asking about')
})

test('🔴 never confirmed surfaces immediately, because no interval has started', () => {
  // Waiting ninety days to ask about a licence nobody has EVER confirmed would
  // be inventing a grace period out of a missing value.
  for (const f of [licence({ statusCheckedAt: null }), licence({ status: 'unknown' })]) {
    const r = recheckClearances([ptRow()], full({ agencyFacts: [f] }))
    assert.equal(r.toConfirm.length, 1, JSON.stringify(f))
    assert.equal(r.toConfirm[0].daysSinceChecked, null, 'null, not 0 — nothing has been measured')
    assert.deepEqual(r.lapsed, [], 'and still not a refusal')
  }
  assert.match(NOTICE.confirmNever('12345'), /Nunca/)
  assert.doesNotMatch(NOTICE.confirmNever('12345'), /0 dias/)
})

test('a licence confirmed inside the interval is not surfaced at all', () => {
  const r = recheckClearances([ptRow()], full({ agencyFacts: [licence({ statusCheckedAt: day(-89) })] }))
  assert.deepEqual(r.toConfirm, [])
  // And the boundary is a boundary rather than a coincidence.
  const past = recheckClearances([ptRow()], full({ agencyFacts: [licence({ statusCheckedAt: day(-91) })] }))
  assert.equal(past.toConfirm.length, 1)
  assert.equal(STATUS_STALE_AFTER_DAYS, 90)
})

test('a revoked licence is reported as revoked and not ALSO as one to confirm', () => {
  // It is already the stronger statement. Asking them to confirm a licence we
  // have just told them is not valid reads as though we had not noticed.
  const r = recheckClearances([ptRow()], full({
    agencyFacts: [licence({ status: 'cancelled', statusCheckedAt: day(-400) })],
  }))
  assert.deepEqual(r.lapsed[0].causes, ['registration_revoked'])
  assert.deepEqual(r.toConfirm, [])
})

test('the most-relied-upon licence is first, because it is the one worth a call', () => {
  /*
   * ⚠️ The first version of this test used two licences for the SAME national
   * requirement, so `findAgencyFact` matched the first one for every clearance,
   * the second never appeared, and the sort it claimed to be testing never ran.
   * It passed, and it proved that one licence sorts before no licences.
   *
   * Two jurisdictions, two registrations, different counts — so there is
   * genuinely something to order.
   */
  const policy: PolicyRow[] = [
    policyPT(),
    { country: 'ES', region: null, requires: [req('es_energy_label')],
      regions_exhaustive: true, region_required: true, ...confirmed },
    { country: 'ES', region: 'CT',
      requires: [req('es_cat_aicat', { kind: 'agency_registration', scope: 'regional' })],
      regions_exhaustive: false, region_required: false, ...confirmed },
  ]
  const catalan = row({
    country: 'ES', region: 'CT', listingId: 'c',
    satisfied: [rating({ requirementId: 'es_energy_label' }),
                registration({ requirementId: 'es_cat_aicat', number: '99999' })],
  })
  const r = recheckClearances([ptRow({ listingId: 'a' }), ptRow({ listingId: 'b' }), catalan], {
    now: NOW, policy,
    agencyFacts: [
      licence({ statusCheckedAt: null }),
      licence({ requirementId: 'es_cat_aicat', country: 'ES', region: 'CT',
                number: '99999', statusCheckedAt: null }),
    ],
  })
  assert.equal(r.toConfirm.length, 2, 'two registrations, and both are unconfirmed')
  assert.deepEqual(r.toConfirm.map((c) => [c.number, c.affects]), [['12345', 2], ['99999', 1]])
})

test('the licence copy counts one as one, and says what it is asking for', () => {
  assert.doesNotMatch(NOTICE.confirmAffectsOne, /imóveis/)
  assert.match(NOTICE.confirmAffectsMany(4), /imóveis/)
  assert.match(NOTICE.confirmIntro, /pergunta a fazer à agência/)
  assert.doesNotMatch(NOTICE.confirmIntro, /erro|inválid|problema com a licença/i)
})

test('each cause has a sentence, and the sentences do not say the same thing', () => {
  const sentences = [
    NOTICE.causeExpired, NOTICE.causeRevoked, NOTICE.causeArrived, NOTICE.causeUnresolvable,
  ]
  assert.equal(new Set(sentences).size, 4, 'four causes, four sentences')
  // The one an agency can act on with us, and the one they cannot.
  assert.match(NOTICE.causeRevoked, /IMPIC/, 'it names who resolves it, because it is not us')
  assert.match(NOTICE.causeArrived, /A lei mudou; o imóvel não/)
})

// --- ⚠️ the notice claims nothing it cannot do ------------------------------

test('🔴 NOTHING IN THE NOTICE IMPLIES THE ADVERTISEMENT WAS WITHDRAWN OR CORRECTED', () => {
  // We cannot withdraw a post we did not publish. A notice that reads like an
  // action is worse than one that reads like a warning: somebody reads it,
  // believes the problem is closed, and the unlawful advertisement is still up
  // with our own record saying it was handled.
  /*
   * ⚠️ WIDENED 18 SEP, AND THE GAP IS THE POINT: every participle in the first
   * version was MASCULINE SINGULAR. "O anúncio foi removido" was caught and
   * "a publicação foi removida" was not — and `publicação`, `menção`, `licença`
   * and `peça` are all feminine, so the half of the sentences most likely to be
   * written about this feature walked straight past.
   *
   * `despublic` was worse: written as a prefix inside a group ending in `\b`,
   * it could only match the bare stem, which is not a word. That alternative
   * had never matched anything since the day it was written.
   *
   * Both are the same family as the money pattern that could not see
   * "2 milhões" — a guard that cannot see part of its own subject, and a green
   * result from it meaning nothing about the part it cannot see.
   */
  const CLAIMS_AN_ACT =
    /\b(retir[áa]mos|retirad[oa]s?|remov[êe]mos|removid[oa]s?|corrig[íi]mos|corrigid[oa]s?|despublic\w*|apag[áa]mos|apagad[oa]s?|suspend[êe]mos|suspens[oa]s?|actualiz[áa]mos|actualizad[oa]s?|resolvid[oa]s?|tratad[oa]s?|j[áa] n[ãa]o est[áa] publicad[oa])\b/i

  // The guard must be able to SEE what it forbids, in both genders and both
  // numbers, or the list above is decoration. Asserted before it is used.
  for (const sentence of [
    'O anúncio foi removido', 'A publicação foi removida', 'As menções foram corrigidas',
    'O anúncio foi despublicado', 'A licença está suspensa', 'Já não está publicada',
  ]) {
    assert.ok(CLAIMS_AN_ACT.test(sentence), `the guard cannot see: ${sentence}`)
  }

  const strings: string[] = []
  const walk = (v: unknown) => {
    if (typeof v === 'string') strings.push(v)
    else if (typeof v === 'function') {
      strings.push(String((v as (...a: unknown[]) => string)('A-1042', 30)))
    } else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(NOTICE)

  const offences = strings.filter((s) => CLAIMS_AN_ACT.test(s))
  assert.deepEqual(
    offences, [],
    'These sentences claim we did something to the advertisement. We did not — a person at the ' +
    'agency published it and only they can change it:\n\n' + offences.map((s) => `  • ${s}`).join('\n'),
  )
  assert.ok(strings.length > 10, 'too little copy for the guard to mean anything')
})

test('the notice says what it CAN do, before the list rather than after it', () => {
  // Stating the limit only at the end lets somebody read the list first and
  // form the wrong idea before reaching the correction.
  assert.match(NOTICE.whatWeCanDo, /avisar/)
  assert.match(NOTICE.whatWeCanDo, /a agência que tem de decidir/)
  assert.match(NOTICE.whatWeCanDo, /registado/, 'and that the telling is recorded')
  // The sentence given to the operator to say to the agency stops short too.
  assert.doesNotMatch(NOTICE.whatToTellThem('A-1042'), /retir|remov|corrig/i)
})

test('a count of one reads as one', () => {
  assert.doesNotMatch(NOTICE.lapsedOne, /imóveis/)
  assert.match(NOTICE.lapsedMany(4), /imóveis/)
  assert.doesNotMatch(NOTICE.expiringOne(30), /imóveis/)
})

test('no internal vocabulary reaches the notice or the exemption screen', () => {
  const strings: string[] = []
  const walk = (v: unknown) => {
    if (typeof v === 'string') strings.push(v)
    else if (typeof v === 'function') strings.push(String((v as (...a: unknown[]) => string)('x', 2)))
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(NOTICE); walk(EXEMPTION)
  const offences = strings.flatMap((s) =>
    FORBIDDEN_ON_SCREEN.filter((t) => new RegExp(`\\b${t}\\b`, 'i').test(s)).map((t) => `"${t}" in ${s}`))
  assert.deepEqual(offences, [])
})

// --- the exemption declaration ---------------------------------------------

const decl = (over = {}) => ({
  listingId: 'l1',
  basis: 'Imóvel em ruína, sem condições de habitabilidade',
  declaredBy: 'A. Ferreira',
  recordedBy: 'manuel@ryvodigital.com',
  alreadyRated: false,
  ...over,
})

test('a complete declaration is accepted, and records both people', () => {
  assert.equal(validateExemption(decl()), null)
  const r = exemptionRecord(decl())
  assert.equal(r.declared_by, 'A. Ferreira')
  assert.equal(r.recorded_by, 'manuel@ryvodigital.com')
  assert.ok(r.at, 'the date is set here, so nobody can pass one they chose')
  assert.match(r.basis, /ruína/)
})

test('🔴 the agency declares and we record — never the same person', () => {
  // The segmentation screen's rule, and here the assertion is that a property
  // is legally exempt from certification, which is not a thing we may claim.
  const r = validateExemption(decl({ declaredBy: 'manuel@ryvodigital.com' }))
  assert.match(String(r), /both the declarer and the recorder/)
})

test('a declaration with no author, or no reason, is refused', () => {
  assert.match(String(validateExemption(decl({ declaredBy: '' }))), /name of the person/)
  assert.match(String(validateExemption(decl({ basis: '' }))), /the reason, in their words/)
})

test('🔴 a reason too short to be a reason is refused', () => {
  // "n/a", "-" and "isento" are what gets typed when somebody is clicking
  // through, and a declaration nobody meant is worse than none.
  for (const basis of ['n/a', '-', 'isento', 'nao precisa']) {
    assert.match(String(validateExemption(decl({ basis }))), /too short to be a reason/, basis)
  }
})

test('a rated property needs no exemption, and is told to fix the rating instead', () => {
  const r = validateExemption(decl({ alreadyRated: true }))
  assert.match(String(r), /already has an energy rating/)
  assert.match(String(r), /correct the rating/, 'and what to do instead')
})

test('the exemption screen reads like the segmentation declaration', () => {
  // The recognition is the point: an agency that has sat through the contact
  // declaration must recognise this one. Same question, same hint, same
  // admission that we record rather than decide.
  assert.equal(EXEMPTION.whoIsDeclaring, 'Quem está a dizer isto')
  assert.match(EXEMPTION.whoIsDeclaringHint, /mesmo que sejamos nós a escrever/)
  assert.match(EXEMPTION.whatItDoesNot, /Não somos nós a decidir/)
  assert.match(EXEMPTION.basisHint, /Nas suas palavras/)
})

test('🔴 the warning and the gate agree about when a certificate expires', () => {
  // Two halves of one feature disagreeing by a day: the gate treats a
  // certificate as valid THROUGH its expiry day, and the re-check counted from
  // the start of it. A certificate the gate still accepted would have been
  // reported with "0 days left".
  const onTheDay = row(expiring(day(0)))
  const r = recheckClearances([onTheDay], { now: NOW })
  assert.deepEqual(r.lapsed, [], 'the gate says this is still valid today, so the notice must too')
  assert.equal(r.expiringSoon[0].daysLeft, 0,
    'zero WHOLE days left, and still valid today — which is what the gate says too')

  // And the day after it expires, both agree it has lapsed.
  const gone = recheckClearances([row(expiring(day(-1)))], { now: NOW })
  assert.equal(gone.lapsed.length, 1)
})

test('zero days left is said as "today", because that is what a person says', () => {
  // Surfaced by the test above: the number is 0 and correct, and "daqui a 0
  // dias" is not a sentence anybody says out loud. The screen is read aloud.
  assert.match(NOTICE.expiresToday('2026-09-18'), /hoje/)
  assert.doesNotMatch(NOTICE.expiresToday('2026-09-18'), /0 dias/)
  assert.match(NOTICE.expiresTomorrow('2026-09-19'), /amanhã/)
  assert.doesNotMatch(NOTICE.expiresTomorrow('2026-09-19'), /1 dias/)
  assert.match(NOTICE.expiresOn('2026-10-01', 13), /13 dias/)
})

test('an exempt property with an old certificate date is still not warned about', () => {
  // The exemption short-circuit was UNTESTED: the existing exempt-property test
  // also has a null expiry date, so the second half of the condition caught it
  // and removing the first half broke nothing. A property rated in 2015, its
  // certificate long expired, then declared exempt, is the realistic shape —
  // and the gate clears it, so the notice must not contradict the gate.
  const r = recheckClearances([row({
    satisfied: [rating({ validUntil: day(-900),
      exemption: { declared_by: 'A. Ferreira', basis: 'Imóvel em ruína, sem uso', at: '2026-01-01' } })],
  })], { now: NOW })
  assert.deepEqual(r.lapsed, [], 'the gate clears an exempt property; the notice must agree')
  assert.deepEqual(r.expiringSoon, [])
  assert.equal(r.stillGood, 1)
})
