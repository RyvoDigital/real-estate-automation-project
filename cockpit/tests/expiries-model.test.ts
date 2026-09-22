import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildExpiries, NOT_TRACKED, TRACKED, type ExpiriesInputs, type ObligationCurrent } from '../src/lib/expiries/model'
import type { Recheck } from '../src/lib/publication/recheck'
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

test('🔒 it says it is partial: what is tracked, and what is not yet', () => {
  const e = buildExpiries(inputs())
  for (const t of ['the n8n deploy key', 'the domain', 'the clearances the publication gate recorded']) assert.ok(e.tracked.includes(t), t)
  assert.ok(e.notTracked.some((s) => /template approvals/.test(s)))
  assert.deepEqual(e.notTracked, NOT_TRACKED)
})

test('🔴 the false sentence stays gone: nothing says there is no clearances table (0039 is applied, the gate writes one)', () => {
  // Today printed "clearances (there is no clearances table, and nothing writes one)" until 22 Sep 2026.
  assert.ok(![...TRACKED, ...NOT_TRACKED].some((s) => /no clearances table|nothing writes one/.test(s)))
  assert.ok(!NOT_TRACKED.some((s) => /clearance/.test(s)), 'clearances are tracked now, so they are not in "not yet"')
})

// ── Ryvo's own and the clearances (/ops/expiries checkpoint 2, 22 Sep 2026) ──

const obl = (over: Partial<ObligationCurrent>): ObligationCurrent => ({
  id: 'o1', obligation_id: 'o1', act: 'entered', kind: 'certidao', label: 'Certidão permanente', expires_on: '2027-03-01', no_expiry_stated: false,
  card_brand: null, card_last_four: null, card_exp_month: null, card_exp_year: null, services: null, note: null,
  recorded_by: 'manuelvale@ryvodigital.com', recorded_at: '2026-09-20T10:00:00Z', ...over,
})
const recheck = (over: Partial<Recheck> = {}): Recheck => ({ lapsed: [], expiringSoon: [], toConfirm: [], stillGood: 0, checked: 0, warnWithinDays: 30, staleAfterDays: 90, notCheckedFor: [], ...over })

test('🔒 Ryvo\'s own table holds EVERY one of Ryvo\'s items, good ones too; the lists only the due ones', () => {
  const e = buildExpiries(inputs({ domain: { expiresOn: '2027-03-18', readAt: '2026-09-22T11:50:00Z' }, obligations: [obl({})] }))
  assert.deepEqual(e.ryvoOwn.map((x) => x.kind).sort(), ['certidao', 'deploy_key', 'domain'])
  assert.ok(e.ryvoOwn.every((x) => x.standing === 'good'))
  assert.equal(e.aboutTo.length + e.runOut.length, 0, 'nothing due, so nothing in the lists')
})

test('🔒 the domain: fresh is a date; stale is UNKNOWN with its age; never read says so; a failed read is a failure', () => {
  const fresh = buildExpiries(inputs({ domain: { expiresOn: '2026-10-10', readAt: '2026-09-22T11:50:00Z' } }))
  assert.equal(fresh.aboutTo.find((x) => x.kind === 'domain')?.days, 18)
  const stale = buildExpiries(inputs({ domain: { expiresOn: '2027-03-18', readAt: '2026-09-21T09:00:00Z' } }))
  const d = stale.aboutTo.find((x) => x.kind === 'domain')!
  assert.equal(d.standing, 'unknown')
  assert.match(d.note ?? '', /last read 27 hours ago, so this date is not asserted/)
  assert.match(buildExpiries(inputs({ domain: 'never' })).ryvoOwn.find((x) => x.kind === 'domain')?.note ?? '', /No health run has read the registry/)
  assert.match(buildExpiries(inputs({ domain: null })).failures.join(' '), /domain’s expiry could not be read/)
})

test('🔴 THE PROCURAÇÃO WITH NO EXPIRY STATED is said in words, in Ryvo\'s table, and never in a list as a date', () => {
  const e = buildExpiries(inputs({ obligations: [obl({ id: 'p', obligation_id: 'p', kind: 'procuracao', label: 'Procuração', expires_on: null, no_expiry_stated: true })] }))
  const p = e.ryvoOwn.find((x) => x.kind === 'procuracao')!
  assert.deepEqual([p.standing, p.date, p.days], ['no_expiry', null, null])
  assert.equal(p.note, 'The document states no expiry.')
  assert.ok(![...e.runOut, ...e.aboutTo, ...e.toConfirm].some((x) => x.kind === 'procuracao'))
})

test('🔴 a card lapses on the LAST DAY of its month, and its line names every service behind it', () => {
  const e = buildExpiries(inputs({ obligations: [obl({ id: 'c', obligation_id: 'c', kind: 'payment_card', label: 'Cartão da empresa', expires_on: null,
    card_brand: 'Visa', card_last_four: '4242', card_exp_month: 10, card_exp_year: 2026, services: ['Hetzner', 'Vercel', 'Supabase'] })] }))
  const c = e.ryvoOwn.find((x) => x.kind === 'payment_card')!
  assert.equal(c.date, '2026-10-31')
  assert.equal(c.days, 39, 'thirty-nine days to the 31st of October')
  assert.match(c.note ?? '', /Visa ····4242, expires 10\/2026\. Charged to: Hetzner, Vercel, Supabase\./)
  assert.doesNotMatch(JSON.stringify(e), /\d{13,}/, 'nothing card-number shaped anywhere in the model')
})

test('a certidão past its date has run out, and names itself', () => {
  const e = buildExpiries(inputs({ obligations: [obl({ expires_on: '2026-09-01' })] }))
  assert.equal(e.runOut[0].kind, 'certidao')
  assert.equal(e.runOut[0].days, -21)
})

test('🔴 CLEARANCES: a lapse carries EVERY cause; an expiring one is "about to"; what could not be checked is SAID', () => {
  const r = recheck({
    checked: 5, stillGood: 3, notCheckedFor: ['registration_revoked'],
    lapsed: [{ clearanceId: 'k1', listingId: 'l1', reference: 'MS-114', causes: ['certificate_expired', 'requirement_arrived'], requirementIds: [], since: '2026-09-10', daysAgo: 12, noticeSentAt: null }],
    expiringSoon: [{ clearanceId: 'k2', listingId: 'l2', reference: 'MS-120', expiresOn: '2026-10-01', daysLeft: 9 }],
  })
  const e = buildExpiries(inputs({ clearances: [{ id: 'c1', name: 'Marbella Sur', recheck: r }] }))
  const lapsed = e.runOut.find((x) => x.kind === 'clearance')!
  assert.deepEqual(lapsed.causes, ['certificate_expired', 'requirement_arrived'], 'all of them, never the first found')
  assert.equal(lapsed.days, -12)
  assert.match(lapsed.note ?? '', /has not been told/)
  assert.equal(e.aboutTo.find((x) => x.kind === 'clearance')?.days, 9)
  assert.deepEqual(e.notCheckedFor, [{ client: 'Marbella Sur', causes: ['registration_revoked'] }])
  assert.deepEqual([e.checked.clearances, e.checked.stillGoodClearances], [5, 3])
})

test('🔒 a revocation with no known date is "we do not know when", never zero days', () => {
  const r = recheck({ checked: 1, lapsed: [{ clearanceId: 'k', listingId: 'l', reference: null, causes: ['registration_revoked'], requirementIds: [], since: null, daysAgo: null, noticeSentAt: null }] })
  const x = buildExpiries(inputs({ clearances: [{ id: 'c', name: 'M', recheck: r }] })).runOut[0]
  assert.deepEqual([x.date, x.days], [null, null])
})

test('a failed clearances read, or one client\'s, is a named failure, never an empty list', () => {
  assert.match(buildExpiries(inputs({ clearances: null })).failures.join(' '), /clearances could not be read/)
  assert.match(buildExpiries(inputs({ clearances: [{ id: 'c', name: 'Casa Atlântica', recheck: null }] })).failures.join(' '), /Casa Atlântica: the clearances could not be re-checked/)
  assert.match(buildExpiries(inputs({ obligations: null })).failures.join(' '), /Ryvo’s own obligations could not be read/)
})
