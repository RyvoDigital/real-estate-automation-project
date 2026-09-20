import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyStillGood,
  STATUS_STALE_AFTER_DAYS,
  WARN_WITHIN_DAYS,
} from '../src/lib/publication/still-good'
import type { AgencyFact, PropertyFact } from '../src/lib/publication/facts-store'

/*
 * What is still good. The screen that CAN be built from listing_facts and
 * agency_facts, as distinct from the clearance re-check that cannot.
 */

const NOW = new Date('2026-09-20T09:00:00.000Z')
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString().slice(0, 10)

const fact = (o: Partial<PropertyFact> & { listingId: string }): PropertyFact & { listingId: string } => ({
  id: 'f1',
  requirementId: 'pt_energy_class',
  values: {},
  certificateNumber: 'SCE-1',
  validUntil: day(100),
  registrationStatus: 'not_required',
  exemption: null,
  source: 'typed',
  ...o,
})

const reg = (o: Partial<AgencyFact> = {}): AgencyFact => ({
  id: 'a1',
  requirementId: 'pt_ami',
  country: 'PT',
  region: null,
  number: 'AMI 1234',
  status: 'unknown',
  statusCheckedAt: null,
  ...o,
})

const run = (p: (PropertyFact & { listingId: string })[], a: AgencyFact[] = []) =>
  classifyStillGood({ propertyFacts: p, agencyFacts: a, listings: new Map([['L1', 'CA-0212']]), now: NOW })

test('a date behind us is past, a near one is soon, a far one is good', () => {
  const out = run([
    fact({ listingId: 'L1', id: 'a', validUntil: day(-3) }),
    fact({ listingId: 'L1', id: 'b', validUntil: day(10) }),
    fact({ listingId: 'L1', id: 'c', validUntil: day(400) }),
  ])
  assert.deepEqual(out.documents.map((d) => d.standing), ['past', 'soon', 'good'])
  assert.equal(out.documents[0].daysLeft, -3, 'past is a negative count, not an absolute one')
})

test(`the warning window is ${WARN_WITHIN_DAYS} days, and its edge is inclusive`, () => {
  const out = run([
    fact({ listingId: 'L1', id: 'a', validUntil: day(WARN_WITHIN_DAYS) }),
    fact({ listingId: 'L1', id: 'b', validUntil: day(WARN_WITHIN_DAYS + 1) }),
  ])
  assert.deepEqual(out.documents.map((d) => d.standing), ['soon', 'good'])
})

test('🔒 an exemption has nothing to run out, so it is counted apart rather than listed', () => {
  // 0030 permits a null date only when an exemption is present, so this is the
  // constraint read back. A screen that listed them would be asking when a
  // declaration expires, and a declaration has no certificate to expire.
  const out = run([
    fact({ listingId: 'L1', id: 'x', validUntil: null, exemption: { declared_by: 'Ana', basis: 'anexo agrícola', at: '2026-09-12' } }),
    fact({ listingId: 'L1', id: 'y', validUntil: day(5) }),
  ])
  assert.equal(out.documents.length, 1, 'only the dated one is listed')
  assert.equal(out.exempt, 1, 'and the other is counted, so its absence is legible')
})

test('documents sort worst first, on their own clock only', () => {
  const out = run([
    fact({ listingId: 'L1', id: 'a', validUntil: day(9) }),
    fact({ listingId: 'L1', id: 'b', validUntil: day(-40) }),
    fact({ listingId: 'L1', id: 'c', validUntil: day(2) }),
  ])
  assert.deepEqual(out.documents.map((d) => d.daysLeft), [-40, 2, 9])
})

test('a document names the property a person would recognise', () => {
  const out = run([fact({ listingId: 'L1' })])
  assert.equal(out.documents[0].reference, 'CA-0212')
  const unknown = classifyStillGood({
    propertyFacts: [fact({ listingId: 'L9' })],
    agencyFacts: [],
    listings: new Map(),
    now: NOW,
  })
  assert.equal(unknown.documents[0].reference, null, 'and null rather than a uuid dressed as a reference')
})

// ── registrations ───────────────────────────────────────────────────────────

test('🔴 never checked is its own standing, not a very stale check', () => {
  const never = run([], [reg({ statusCheckedAt: null })]).registrations[0]
  const stale = run([], [reg({ status: 'valid', statusCheckedAt: day(-STATUS_STALE_AFTER_DAYS - 10) })]).registrations[0]
  assert.equal(never.standing, 'never_checked')
  assert.equal(stale.standing, 'stale')
  assert.notEqual(never.standing, stale.standing, '"we have never looked" and "we looked a while ago" are different facts')
})

test('⚠️ a registration nobody has checked has NO interval — null, never zero', () => {
  const never = run([], [reg({ statusCheckedAt: null })]).registrations[0]
  assert.equal(never.daysSinceChecked, null)
  assert.notEqual(never.daysSinceChecked, 0, 'zero would be a fact computed from an absence')
})

test('suspended and cancelled are known bad, whenever they were checked', () => {
  for (const status of ['suspended', 'cancelled'] as const) {
    const r = run([], [reg({ status, statusCheckedAt: day(-1) })]).registrations[0]
    assert.equal(r.standing, 'not_valid', `${status} is not a date question`)
  }
})

test(`a status checked inside ${STATUS_STALE_AFTER_DAYS} days is good, outside it is stale`, () => {
  const inside = run([], [reg({ status: 'valid', statusCheckedAt: day(-STATUS_STALE_AFTER_DAYS) })]).registrations[0]
  const outside = run([], [reg({ status: 'valid', statusCheckedAt: day(-STATUS_STALE_AFTER_DAYS - 1) })]).registrations[0]
  assert.equal(inside.standing, 'good')
  assert.equal(outside.standing, 'stale')
})

// ── the honesty half ────────────────────────────────────────────────────────

test('🔴 it says what it cannot answer, and the clearance gap is the first thing', () => {
  const out = run([fact({ listingId: 'L1' })])
  assert.ok(out.notAnswered.length >= 3)
  assert.match(out.notAnswered[0], /no clearance is recorded/)
  assert.match(out.notAnswered[0], /documents rather than decisions/)
  assert.ok(
    out.notAnswered.some((s) => /already been told/.test(s)),
    'whether the agency was told is unknowable without persistence, and the screen says so',
  )
})

test('🔒 nothing here claims a property may or may not be advertised', () => {
  const out = run([fact({ listingId: 'L1', validUntil: day(-5) })], [reg({ status: 'cancelled', statusCheckedAt: day(-1) })])
  const everything = JSON.stringify(out).toLowerCase()
  for (const claim of ['advertis', 'publish', 'unlawful', 'illegal']) {
    // `notAnswered` is allowed to use the word — it is the sentence explaining
    // that the screen does NOT make the claim.
    const outsideNotAnswered = JSON.stringify({ ...out, notAnswered: [] }).toLowerCase()
    assert.equal(outsideNotAnswered.includes(claim), false, `"${claim}" must not appear in the findings themselves`)
  }
  assert.ok(everything.includes('clear'), 'while notAnswered names the gap explicitly')
})

test('every figure carries the moment it was computed', () => {
  assert.equal(run([]).at, NOW.toISOString())
})

test('the control: the classifier can produce every standing', () => {
  // If any branch were unreachable the tests above would be asserting on a
  // narrower function than the screen actually calls.
  const docs = run([
    fact({ listingId: 'L1', id: 'a', validUntil: day(-1) }),
    fact({ listingId: 'L1', id: 'b', validUntil: day(1) }),
    fact({ listingId: 'L1', id: 'c', validUntil: day(999) }),
  ]).documents.map((d) => d.standing)
  assert.deepEqual([...new Set(docs)].sort(), ['good', 'past', 'soon'])

  const regs = run([], [
    reg({ id: '1', status: 'suspended', statusCheckedAt: day(-1) }),
    reg({ id: '2', statusCheckedAt: null }),
    reg({ id: '3', status: 'valid', statusCheckedAt: day(-STATUS_STALE_AFTER_DAYS - 5) }),
    reg({ id: '4', status: 'valid', statusCheckedAt: day(-1) }),
  ]).registrations.map((r) => r.standing)
  assert.deepEqual([...new Set(regs)].sort(), ['good', 'never_checked', 'not_valid', 'stale'])
})
