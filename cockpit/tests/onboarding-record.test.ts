import { test } from 'node:test'
import assert from 'node:assert/strict'
import { saveRecord, validateRecord, type RecordContext, type RecordDeps } from '../src/lib/onboarding-record'

/* The two things onboarding records itself (0054): the routing proof, both halves
   or nothing; and the AI-disclosure conversation, with who heard it. */

const OTHER = '00000000-0000-0000-0000-00000000000b'
const ctx: RecordContext = { clientId: 'c1', createdOn: '2026-09-20', today: '2026-09-22', otherClientIds: [OTHER] }
const form = (v: Record<string, string>) => { const f = new FormData(); for (const [k, x] of Object.entries(v)) f.set(k, x); return f }
function fake(over: Partial<{ recordable: boolean; error: string | null }> = {}) {
  const rows: Record<string, unknown>[] = []; const revalidated: string[] = []
  const deps: RecordDeps = {
    recordable: over.recordable ?? true,
    async insert(row) { if (over.error) return { error: { message: over.error } }; rows.push(row); return { error: null } },
    revalidate(p) { revalidated.push(p) },
  }
  return { deps, rows, revalidated }
}
const ROUTING = { happened_on: '2026-09-22', existing_client_id: OTHER, new_answered: 'yes', existing_answered: 'yes' }

test('🔴 routing: both halves ticked -> one row with both halves true and the other client named', async () => {
  const f = fake()
  const r = await saveRecord('routing', form(ROUTING), 'manuel@ryvo', ctx, f.deps)
  assert.equal(r.ok, true)
  assert.deepEqual(f.rows, [{ client_id: 'c1', step: 'routing_proved', happened_on: '2026-09-22', recorded_by: 'manuel@ryvo',
    detail: { new_client_answered: true, existing_client_answered: true, existing_client_id: OTHER } }])
  assert.deepEqual(f.revalidated, ['/onboarding'])
})

test('🔴 routing: ONE half is refused, each way, and nothing is written', async () => {
  for (const missing of ['new_answered', 'existing_answered'] as const) {
    const f = fake()
    const r = await saveRecord('routing', form({ ...ROUTING, [missing]: '' }), 'manuel', ctx, f.deps)
    assert.equal(r.ok, false, missing)
    assert.ok(r.errors[missing], missing)
    assert.equal(f.rows.length, 0)
  }
  const e = validateRecord('routing', { ...ROUTING, existing_answered: '' }, 'm', ctx)
  assert.ok(!e.ok && /Checking only the new one proves nothing/.test(e.errors.existing_answered))
})

test('routing: the other half must be ANOTHER client, and one that can be checked', () => {
  const self = validateRecord('routing', { ...ROUTING, existing_client_id: 'c1' }, 'm', ctx)
  assert.ok(!self.ok && self.errors.existing_client_id)
  const stranger = validateRecord('routing', { ...ROUTING, existing_client_id: '00000000-0000-0000-0000-0000000000ff' }, 'm', ctx)
  assert.ok(!stranger.ok && stranger.errors.existing_client_id)
  const none = validateRecord('routing', { ...ROUTING, existing_client_id: '' }, 'm', ctx)
  assert.ok(!none.ok && none.errors.existing_client_id)
})

test('the day: required, never in the future, never before the client existed', () => {
  for (const [day, re] of [['', /The day/], ['2026-09-23', /has not happened yet/], ['2026-09-19', /Before this client existed/], ['22/09/2026', /The day/]] as const) {
    const r = validateRecord('disclosure', { happened_on: day, told: 'Ana' }, 'm', ctx)
    assert.ok(!r.ok && re.test(r.errors.happened_on), `${day}: ${JSON.stringify(r)}`)
  }
  assert.ok(validateRecord('disclosure', { happened_on: '2026-09-22', told: 'Ana' }, 'm', ctx).ok, 'today is fine')
  assert.ok(validateRecord('disclosure', { happened_on: '2026-09-20', told: 'Ana' }, 'm', ctx).ok, 'the creation day is fine')
})

test('disclosure: who heard it is required, and recorded as said', async () => {
  const f = fake()
  const bad = await saveRecord('disclosure', form({ happened_on: '2026-09-22', told: '   ' }), 'm', ctx, f.deps)
  assert.equal(bad.ok, false)
  assert.ok(bad.errors.told)
  const good = await saveRecord('disclosure', form({ happened_on: '2026-09-22', told: 'Ana, the owner' }), 'm', ctx, f.deps)
  assert.equal(good.ok, true)
  assert.deepEqual((f.rows[0] as { detail: unknown }).detail, { told: 'Ana, the owner' })
})

test('🔒 0054 not applied: refused with the reason, nothing written, the typed values kept', async () => {
  const f = fake({ recordable: false })
  const r = await saveRecord('disclosure', form({ happened_on: '2026-09-22', told: 'Ana' }), 'm', ctx, f.deps)
  assert.equal(r.ok, false)
  assert.match(r.message, /migration 0054/)
  assert.equal(r.values.told, 'Ana')
  assert.equal(f.rows.length, 0)
})

test('a database refusal is said, keeps what was typed, and revalidates nothing', async () => {
  const f = fake({ error: 'new row violates check constraint "routing_proof_has_both_halves"' })
  const r = await saveRecord('routing', form(ROUTING), 'm', ctx, f.deps)
  assert.equal(r.ok, false)
  assert.match(r.message, /the database refused it: new row violates/)
  assert.equal(r.values.existing_client_id, OTHER)
  assert.deepEqual(f.revalidated, [])
})
