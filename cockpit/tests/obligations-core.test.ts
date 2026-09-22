/*
 * Ryvo's own expiries, written (/ops/expiries checkpoint 1, 22 Sep 2026).
 * Every path through obligations-core.ts, with a fake store that behaves like
 * 0058: one insert, the pkey, the one-successor rule.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { recordObligation, buildObligation, looksLikeACardNumber, ONE_ACT_KEY, ONE_SUCCESSOR, type ObligationDeps, type ObligationForm, type ObligationRow } from '../src/lib/expiries/obligations-core'
import { OBLIGATION_REFUSALS } from '../src/lib/expiries/copy'

const A = '11111111-2222-4333-8444-555555555555'
const B = '11111111-2222-4333-8444-666666666666'
const C = '11111111-2222-4333-8444-777777777777'
const ME = 'manuelvale@ryvodigital.com'

function store() {
  const rows: ObligationRow[] = []
  const deps: ObligationDeps = {
    insert: async (row) => {
      if (rows.some((r) => r.id === row.id)) return { error: { code: '23505', message: `duplicate key value violates unique constraint "${ONE_ACT_KEY}"` } }
      if (row.supersedes_id && rows.some((r) => r.supersedes_id === row.supersedes_id)) return { error: { code: '23505', message: `duplicate key value violates unique constraint "${ONE_SUCCESSOR}"` } }
      rows.push(row); return { error: null }
    },
  }
  return { rows, deps }
}
const f = (over: Partial<ObligationForm> = {}): ObligationForm => ({
  actId: A, obligationId: null, supersedesId: null, act: 'entered', kind: 'certidao', label: 'Certidão permanente',
  expiresOn: '2027-03-01', noExpiryStated: null, cardBrand: null, cardLastFour: null, cardExpMonth: null, cardExpYear: null,
  services: null, note: null, ...over,
})
const card = (over: Partial<ObligationForm> = {}) => f({ kind: 'payment_card', label: 'Cartão da empresa', expiresOn: null, cardBrand: 'Visa', cardLastFour: '4242', cardExpMonth: '11', cardExpYear: '2027', services: 'Hetzner\nVercel, Supabase', ...over })
const key = (r: ReturnType<typeof buildObligation>) => (r.ok ? 'ok' : r.refusal.key)

test('an entry starts its own chain; the recorder is the session', async () => {
  const s = store()
  assert.deepEqual(await recordObligation(f(), ME, s.deps), { ok: true, alreadyRecorded: false, obligationId: A })
  assert.equal(s.rows[0].obligation_id, A)
  assert.equal(s.rows[0].supersedes_id, null)
  assert.equal(s.rows[0].recorded_by, ME)
})

test('🔒 later acts supersede the head and keep the chain; a missing head is refused', async () => {
  const s = store()
  await recordObligation(f(), ME, s.deps)
  const r = await recordObligation(f({ actId: B, act: 'checked', obligationId: A, supersedesId: A }), ME, s.deps)
  assert.equal(r.ok, true)
  assert.deepEqual([s.rows[1].obligation_id, s.rows[1].supersedes_id, s.rows[1].act], [A, A, 'checked'])
  assert.equal(key(buildObligation(f({ act: 'renewed' }), ME)), 'noHead')
})

test('🔒 the same form twice is "already recorded"; a racing second act on the same head is "someone else just changed this"', async () => {
  const s = store()
  await recordObligation(f(), ME, s.deps)
  assert.deepEqual(await recordObligation(f(), ME, s.deps), { ok: true, alreadyRecorded: true })
  await recordObligation(f({ actId: B, act: 'checked', obligationId: A, supersedesId: A }), ME, s.deps)
  assert.deepEqual(await recordObligation(f({ actId: C, act: 'renewed', obligationId: A, supersedesId: A, expiresOn: '2028-03-01' }), ME, s.deps),
    { ok: false, refusal: { key: 'justChanged' } })
})

test('the certidão needs its date, and a real one', () => {
  assert.equal(key(buildObligation(f({ expiresOn: '' }), ME)), 'certidaoNoDate')
  assert.equal(key(buildObligation(f({ expiresOn: '2027-02-30' }), ME)), 'badDate')
  assert.equal(key(buildObligation(f(), ME)), 'ok')
})

test('🔴 THE PROCURAÇÃO: a date or "no expiry stated", ANSWERED — never blank, never both, never assumed', () => {
  const p = (over: Partial<ObligationForm>) => buildObligation(f({ kind: 'procuracao', label: 'Procuração', expiresOn: null, ...over }), ME)
  assert.equal(key(p({ noExpiryStated: null })), 'procuracaoUnanswered')
  assert.equal(key(p({ noExpiryStated: 'on' })), 'procuracaoUnanswered')
  assert.equal(key(p({ noExpiryStated: 'no' })), 'procuracaoNoDate')
  assert.equal(key(p({ noExpiryStated: 'yes', expiresOn: '2030-01-01' })), 'procuracaoBoth')
  const stated = p({ noExpiryStated: 'yes' })
  assert.equal(stated.ok && stated.row.no_expiry_stated && stated.row.expires_on === null, true)
  const dated = p({ noExpiryStated: 'no', expiresOn: '2030-01-01' })
  assert.equal(dated.ok && !dated.row.no_expiry_stated && dated.row.expires_on === '2030-01-01', true)
})

test('🔴 NEVER A CARD NUMBER: in any field, spaced or dashed, it is refused — and the refusal echoes nothing', () => {
  for (const [field, value] of [['label', 'Visa 4242 4242 4242 4242'], ['note', 'num 4242-4242-4242-4242'], ['services', 'Vercel 4242424242424242'],
    ['cardBrand', '4242424242424242'], ['cardLastFour', '4242424242424242']] as const) {
    const r = buildObligation(card({ [field]: value }), ME)
    assert.deepEqual(r, { ok: false, refusal: { key: 'cardNumber' } }, `${field} let a number through`)
  }
  assert.equal(looksLikeACardNumber('4242'), false)
  assert.equal(looksLikeACardNumber('2027-03-01'), false, 'a date is not a card number')
  assert.equal(looksLikeACardNumber('4242 4242'), false, 'eight digits is a date or a reference, not a card')
  assert.equal(looksLikeACardNumber('4242 4242 4242 4'), true, 'thirteen digits: the shortest card')
  assert.equal(looksLikeACardNumber('4242 4242 4242'), false, 'twelve digits is not a card')
  assert.equal(looksLikeACardNumber('+44 20 7946 0958 123'), false, 'a long phone written with + is not a card')
  assert.equal(looksLikeACardNumber('NIF 514 123 456'), false)
  assert.equal(looksLikeACardNumber('+351 912 345 678'), false)
  // An ordinary note with a date, a NIF and a phone is accepted (the 8-digit rule refused it).
  assert.equal(key(buildObligation(f({ note: 'renovada a 2026-09-22; NIF 514 123 456; tel. +351 912 345 678' }), ME)), 'ok')
})

test('a card is brand, exactly four digits, a month/year and its services — and not a date', () => {
  const ok = buildObligation(card(), ME)
  assert.equal(ok.ok, true)
  assert.deepEqual(ok.ok && ok.row.services, ['Hetzner', 'Vercel', 'Supabase'], 'one line per card, listing every service behind it')
  assert.deepEqual(ok.ok && [ok.row.card_brand, ok.row.card_last_four, ok.row.card_exp_month, ok.row.card_exp_year], ['Visa', '4242', 11, 2027])
  assert.equal(key(buildObligation(card({ cardBrand: '' }), ME)), 'cardNoBrand')
  assert.equal(key(buildObligation(card({ cardLastFour: '424' }), ME)), 'cardLastFour')
  assert.equal(key(buildObligation(card({ cardExpMonth: '13' }), ME)), 'cardExpiry')
  assert.equal(key(buildObligation(card({ services: ' , \n' }), ME)), 'cardNoServices')
  assert.equal(key(buildObligation(card({ expiresOn: '2027-11-30' }), ME)), 'cardHasDate')
})

test('a retirement needs only its head; a database refusal is a key with its code, never its message', async () => {
  const r = buildObligation(card({ actId: B, act: 'retired', obligationId: A, supersedesId: A, cardBrand: null, cardLastFour: null, services: null }), ME)
  assert.equal(r.ok, true)
  const deps: ObligationDeps = { insert: async () => ({ error: { code: '23514', message: 'new row violates check constraint "card_is_described"' } }) }
  assert.deepEqual(await recordObligation(card(), ME, deps), { ok: false, refusal: { key: 'dbRefused', params: { code: '23514' } } })
})

test('every key the core returns is in its catalogue, and the core names 0058\'s constraints exactly', () => {
  const core = readFileSync(join(import.meta.dirname, '..', 'src', 'lib', 'expiries', 'obligations-core.ts'), 'utf8')
  const keys = [...core.matchAll(/\bkey: '(\w+)'/g)].map((m) => m[1])
  assert.ok(keys.length >= 15)
  for (const k of keys) assert.ok(k in OBLIGATION_REFUSALS.en, `the core returns "${k}", which the catalogue lacks`)
  const mig = readFileSync(join(import.meta.dirname, '..', '..', 'db', 'migrations', '0058_ryvo_obligations.sql'), 'utf8')
  assert.match(mig, /create table public\.ryvo_obligations \(\n  id uuid primary key,/)
  assert.match(mig, new RegExp(`create unique index ${ONE_SUCCESSOR} `))
})
