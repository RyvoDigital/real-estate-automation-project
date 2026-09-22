import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildExpiries, NOT_TRACKED, type ExpiriesInputs } from '../src/lib/expiries/model'
import type { StillGood } from '../src/lib/publication/still-good'

/* The one expiries module: Today's groups 3 and 4 now, /ops/expiries in C5. */

const NOW = new Date('2026-09-22T12:00:00Z')
const sg = (over: Partial<StillGood> = {}): StillGood => ({ documents: [], registrations: [], exempt: 0, warnWithinDays: 30, staleAfterDays: 90, at: NOW.toISOString(), notAnswered: [], ...over })
const doc = (id: string, daysLeft: number, standing: 'past' | 'soon' | 'good') => ({ listingId: id, reference: `A-${id}`, requirementId: 'pt_energy_certificate', certificateNumber: null, validUntil: new Date(NOW.getTime() + daysLeft * 86400000).toISOString().slice(0, 10), daysLeft, standing })
const reg = (n: string, standing: 'not_valid' | 'never_checked' | 'stale' | 'good', days: number | null = null) => ({ requirementId: 'pt_ami_licence', number: n, country: 'PT', region: null, status: 'valid' as never, checkedAt: null, daysSinceChecked: days, standing })
const inputs = (over: Partial<ExpiriesInputs> = {}): ExpiriesInputs => ({
  deployKey: { exp: '2027-09-20T22:00:00Z', readAt: '2026-09-22T11:55:00Z' },
  clients: [], now: NOW, ...over,
})

test('the deploy key a year out: checked, and in no list', () => {
  const e = buildExpiries(inputs())
  assert.equal(e.checked.deployKeys, 1)
  assert.deepEqual([e.runOut.length, e.aboutTo.length, e.toConfirm.length], [0, 0, 0])
})

test('the deploy key within 30 days is "about to"; past its date it has "run out"', () => {
  const soon = buildExpiries(inputs({ deployKey: { exp: '2026-10-10T00:00:00Z', readAt: '2026-09-22T11:55:00Z' } }))
  assert.equal(soon.aboutTo[0].kind, 'deploy_key')
  assert.equal(soon.aboutTo[0].days, 18)
  const past = buildExpiries(inputs({ deployKey: { exp: '2026-09-20T00:00:00Z', readAt: '2026-09-22T11:55:00Z' } }))
  assert.equal(past.runOut[0].kind, 'deploy_key')
  assert.equal(past.runOut[0].days, -2)
})

test('🔒 a deploy-key reading that is not current is UNKNOWN with its age, never a clean date', () => {
  const e = buildExpiries(inputs({ deployKey: { exp: '2027-09-20T22:00:00Z', readAt: '2026-09-20T12:00:00Z' } }))
  assert.equal(e.aboutTo[0].standing, 'unknown')
  assert.match(e.aboutTo[0].note ?? '', /Not read for 2 days, so this date is not asserted/)
})

test('🔒 a failed read is a named failure, never an empty list', () => {
  const e = buildExpiries(inputs({ deployKey: null, clients: null }))
  assert.equal(e.failures.length, 2)
  assert.match(e.failures.join(' '), /deploy key’s expiry could not be read/)
  assert.match(e.failures.join(' '), /no client’s documents were checked/)
  const one = buildExpiries(inputs({ clients: [{ id: 'c1', name: 'Marbella Sur', stillGood: null }] }))
  assert.match(one.failures[0], /Marbella Sur: the documents and registrations could not be read/)
})

test('client documents: past to "run out" (most overdue first), soon to "about to" (fewest days first), good nowhere', () => {
  const e = buildExpiries(inputs({ clients: [{ id: 'c1', name: 'Marbella Sur', stillGood: sg({ documents: [doc('1', -3, 'past'), doc('2', -40, 'past'), doc('3', 20, 'soon'), doc('4', 5, 'soon'), doc('5', 200, 'good')] }) }] }))
  assert.deepEqual(e.runOut.map((x) => x.days), [-40, -3])
  assert.deepEqual(e.aboutTo.map((x) => x.days), [5, 20])
  assert.equal(e.checked.documents, 5)
  assert.ok(e.runOut.every((x) => x.owner.kind === 'client' && x.owner.name === 'Marbella Sur'), 'every row names its client')
})

test('🔒 registrations are keyed by the registration: suspended has run out; never checked and stale are to confirm', () => {
  const e = buildExpiries(inputs({ clients: [{ id: 'c1', name: 'Marbella Sur', stillGood: sg({ registrations: [reg('111', 'not_valid'), reg('222', 'stale', 120), reg('333', 'never_checked'), reg('444', 'good', 3)] }) }] }))
  assert.equal(e.runOut.length, 1)
  assert.equal(e.runOut[0].standing, 'not_valid')
  assert.deepEqual(e.toConfirm.map((x) => x.what), ['pt ami licence 333', 'pt ami licence 222'], 'never checked first, then the longest unchecked')
  assert.equal(e.checked.registrations, 4)
})

test('🔒 the three lists never merge: a registration is never in "about to", a document never in "to confirm"', () => {
  const e = buildExpiries(inputs({ clients: [{ id: 'c1', name: 'M', stillGood: sg({ documents: [doc('1', 5, 'soon')], registrations: [reg('9', 'never_checked')] }) }] }))
  assert.ok(e.aboutTo.every((x) => x.kind !== 'registration'))
  assert.ok(e.toConfirm.every((x) => x.kind === 'registration'))
})

test('🔒 it says it is partial: what is tracked, and that clearances are not', () => {
  const e = buildExpiries(inputs())
  assert.ok(e.tracked.includes('the n8n deploy key'))
  assert.ok(e.notTracked.some((s) => /clearances/.test(s)))
  assert.deepEqual(e.notTracked, NOT_TRACKED)
})
