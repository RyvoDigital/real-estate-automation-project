import test from 'node:test'
import assert from 'node:assert/strict'

import { WARN_WITHIN_DAYS, recheckClearances, type ClearanceRow } from '../src/lib/publication/recheck'
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

const row = (over: Partial<ClearanceRow> = {}): ClearanceRow => ({
  clearanceId: Math.random().toString(36).slice(2),
  listingId: 'l1',
  reference: 'A-1042',
  energyClass: 'B',
  energyCertificateExpiresAt: day(400),
  exemption: null,
  amiLicence: 'AMI 12345',
  decidedAt: '2026-09-18T00:00:00Z',
  noticeSentAt: null,
  ...over,
})

// --- the re-check -----------------------------------------------------------

test('a clearance lapses without anybody acting', () => {
  // Nothing about the property changed. The clock moved.
  const r = recheckClearances([row({ energyCertificateExpiresAt: day(-40) })], { now: NOW })
  assert.equal(r.lapsed.length, 1)
  assert.equal(r.lapsed[0].daysAgo, 40)
  assert.equal(r.stillGood, 0)
})

test('a certificate expiring soon is warned about, not yet lapsed', () => {
  const r = recheckClearances([row({ energyCertificateExpiresAt: day(10) })], { now: NOW })
  assert.deepEqual(r.lapsed, [])
  assert.equal(r.expiringSoon.length, 1)
  assert.equal(r.expiringSoon[0].daysLeft, 10)
})

test('an exempt property has nothing to expire and nothing to warn about', () => {
  const r = recheckClearances([row({
    energyClass: null, energyCertificateExpiresAt: null,
    exemption: { declaredBy: 'A. Ferreira', basis: 'Imóvel em ruína, sem uso', at: '2020-01-01' },
  })], { now: NOW })
  assert.deepEqual(r.lapsed, [])
  assert.deepEqual(r.expiringSoon, [])
  assert.equal(r.stillGood, 1)
})

test('the longest-lapsed is first, because it has been unlawful longest', () => {
  const r = recheckClearances([
    row({ listingId: 'a', energyCertificateExpiresAt: day(-5) }),
    row({ listingId: 'b', energyCertificateExpiresAt: day(-200) }),
  ], { now: NOW })
  assert.deepEqual(r.lapsed.map((l) => l.listingId), ['b', 'a'])
})

test('having already been told is carried, so a second notice is a choice', () => {
  const r = recheckClearances(
    [row({ energyCertificateExpiresAt: day(-40), noticeSentAt: '2026-09-01T00:00:00Z' })],
    { now: NOW },
  )
  assert.equal(r.lapsed[0].noticeSentAt, '2026-09-01T00:00:00Z')
})

test('nothing to report is reported as nothing, and the totals add up', () => {
  const r = recheckClearances([row(), row(), row({ energyCertificateExpiresAt: day(-1) })], { now: NOW })
  assert.equal(r.checked, 3)
  assert.equal(r.lapsed.length + r.expiringSoon.length + r.stillGood, 3,
    'every clearance lands in exactly one bucket')
  assert.equal(WARN_WITHIN_DAYS, 30)
})

// --- ⚠️ the notice claims nothing it cannot do ------------------------------

test('🔴 NOTHING IN THE NOTICE IMPLIES THE ADVERTISEMENT WAS WITHDRAWN OR CORRECTED', () => {
  // We cannot withdraw a post we did not publish. A notice that reads like an
  // action is worse than one that reads like a warning: somebody reads it,
  // believes the problem is closed, and the unlawful advertisement is still up
  // with our own record saying it was handled.
  const CLAIMS_AN_ACT =
    /\b(retir[áa]mos|retirado|remov[êe]mos|removido|corrig[íi]mos|corrigido|despublic|apag[áa]mos|apagado|suspend[êe]mos|suspenso|actualiz[áa]mos|actualizado|resolvido|tratado|j[áa] n[ãa]o est[áa] publicado)\b/i

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
  const onTheDay = row({ energyCertificateExpiresAt: day(0) })
  const r = recheckClearances([onTheDay], { now: NOW })
  assert.deepEqual(r.lapsed, [], 'the gate says this is still valid today, so the notice must too')
  assert.equal(r.expiringSoon[0].daysLeft, 0,
    'zero WHOLE days left, and still valid today — which is what the gate says too')

  // And the day after it expires, both agree it has lapsed.
  const gone = recheckClearances([row({ energyCertificateExpiresAt: day(-1) })], { now: NOW })
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
    energyClass: null,
    energyCertificateExpiresAt: day(-900),
    exemption: { declaredBy: 'A. Ferreira', basis: 'Imóvel em ruína, sem uso', at: '2026-01-01' },
  })], { now: NOW })
  assert.deepEqual(r.lapsed, [], 'the gate clears an exempt property; the notice must agree')
  assert.deepEqual(r.expiringSoon, [])
  assert.equal(r.stillGood, 1)
})
