import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseAmount, parseParty, save, validate, type Insert } from '../src/lib/month/entry'

/*
 * The Month's entries (brief I §2.10–2.11). The save core is handed a fake
 * database and a fake revalidate, so nothing here can reach production.
 * 🔒 After a save the page is current (revalidate('/') after a successful
 * insert, and only then); a failed save keeps what was typed.
 */

const A = 'a:11111111-1111-4111-8111-111111111111'
const W = 'w:22222222-2222-4222-8222-222222222222'
const fd = (o: Record<string, string | string[]>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) f.append(k, x)
  return f
}
const fake = (error: string | null = null) => {
  const calls: { table: string; row: Record<string, unknown> }[] = []
  const revalidated: string[] = []
  const insert: Insert = async (table, row) => { calls.push({ table, row }); return { error: error ? { message: error } : null } }
  return { calls, revalidated, deps: { insert, revalidate: (p: string) => revalidated.push(p), clientCostsRecordable: true } }
}

test('amounts: Portuguese and English forms, and nothing guessed', () => {
  assert.equal(parseAmount('650'), '650.00')
  assert.equal(parseAmount('1 234,50'), '1234.50')
  assert.equal(parseAmount('€ 60,5'), '60.50')
  assert.equal(parseAmount('1.234,50'), '1234.50')
  assert.equal(parseAmount('1,234.50'), '1234.50')
  assert.equal(parseAmount('12,345'), null) // three decimals: not a guess
  assert.equal(parseAmount('-5'), null)
  assert.equal(parseAmount('abc'), null)
})

test('a party is one field naming one kind of client — never two that could disagree', () => {
  assert.deepEqual(parseParty(A), { automation_client_id: '11111111-1111-4111-8111-111111111111', web_client_id: null })
  assert.deepEqual(parseParty(W), { automation_client_id: null, web_client_id: '22222222-2222-4222-8222-222222222222' })
  assert.equal(parseParty('x:nope'), null)
})

test('🔒 a saved contract revalidates the page, once, after the insert', async () => {
  const f = fake()
  const r = await save('contract', fd({ party: A, monthly_eur: '650', starts_on: '2026-10-17', signed_by: 'Sample', automations: ['inbound_concierge'] }), 'op@x', f.deps)
  assert.equal(r.ok, true)
  assert.deepEqual(f.revalidated, ['/'])
  assert.equal(f.calls[0].table, 'client_contracts')
  assert.deepEqual(f.calls[0].row.automations, ['inbound_concierge'])
  assert.equal(f.calls[0].row.monthly_eur, '650.00')
  assert.equal(f.calls[0].row.recorded_by, 'op@x')
  assert.deepEqual(r.values, {}) // the form clears after a save
})

test('🔒 a refused save keeps what was typed and does NOT revalidate', async () => {
  const f = fake('violates check constraint "contract_money_is_not_negative"')
  const typed = { party: W, monthly_eur: '250', starts_on: '2026-10-01', signed_by: 'Sample' }
  const r = await save('contract', fd(typed), 'op@x', f.deps)
  assert.equal(r.ok, false)
  assert.match(r.message, /database refused it/)
  assert.equal(r.values.monthly_eur, '250')
  assert.equal(r.values.party, W)
  assert.deepEqual(f.revalidated, [])
})

test('a thrown insert is a failed save, not a crash, and keeps the values', async () => {
  const f = fake()
  const throwing = { ...f.deps, insert: (async () => { throw new Error('fetch failed') }) as Insert }
  const r = await save('cost', fd({ label: 'Server', category: 'infrastructure', side: 'automation', amount_eur: '18,50', cadence: 'monthly', started_on: '2026-07-01' }), 'op@x', throwing)
  assert.equal(r.ok, false)
  assert.match(r.message, /fetch failed/)
  assert.equal(r.values.amount_eur, '18,50')
})

test('an invalid form never reaches the database', async () => {
  const f = fake()
  const r = await save('contract', fd({ party: '', monthly_eur: 'lots', starts_on: 'soon' }), 'op@x', f.deps)
  assert.equal(r.ok, false)
  assert.deepEqual(Object.keys(r.errors).sort(), ['monthly_eur', 'party', 'signed_by', 'starts_on'])
  assert.equal(f.calls.length, 0)
  assert.deepEqual(f.revalidated, [])
})

test('a web client\'s contract covers no automations', () => {
  const v = validate('contract', { party: W, monthly_eur: '250', starts_on: '2026-10-01', signed_by: 'S', automations: 'inbound_concierge' }, 'op', { clientCostsRecordable: true })
  assert.equal(v.ok, false)
})

test('a payment arrived on a date AND in an amount, or neither (0043)', () => {
  const base = { party: W, kind: 'project', amount_eur: '600' }
  assert.equal(validate('payment', { ...base, settled_on: '2026-09-11' }, 'op', { clientCostsRecordable: true }).ok, false)
  assert.equal(validate('payment', { ...base, settled_on: '2026-09-11', settled_amount_eur: '600' }, 'op', { clientCostsRecordable: true }).ok, true)
  assert.equal(validate('payment', { ...base }, 'op', { clientCostsRecordable: true }).ok, true) // invoiced, not yet arrived
})

test('a client\'s own cost: only on its own side, and only after 0052', () => {
  const cost = { label: 'Domain', category: 'domain', amount_eur: '15', cadence: 'annual', started_on: '2024-10-28' }
  assert.equal(validate('cost', { ...cost, side: 'web', party: W }, 'op', { clientCostsRecordable: true }).ok, true)
  assert.equal(validate('cost', { ...cost, side: 'shared', party: W }, 'op', { clientCostsRecordable: true }).ok, false)
  const before = validate('cost', { ...cost, side: 'web', party: W }, 'op', { clientCostsRecordable: false })
  assert.equal(before.ok, false)
  assert.match(!before.ok ? before.errors.party : '', /0052/)
  // no client named: a business's cost, fine before and after
  assert.equal(validate('cost', { ...cost, side: 'web', party: '' }, 'op', { clientCostsRecordable: false }).ok, true)
})
