/*
 * The consent rules, proved on every run — design §4.3.
 *
 * These call public.resolve_consent_state() through PostgREST with SYNTHETIC
 * events. Nothing is written, nothing is cleaned up, and there is no fixture to
 * go stale. That is the whole reason the rules live in a pure function instead
 * of inside the view: a view can only be tested by writing rows, and this
 * ledger refuses DELETE, so such a test could never run here.
 *
 * ONE definition of the rules — the function. The views call it. There is no
 * TypeScript mirror to drift out of agreement with it (lesson 15).
 *
 * These fail until 0013 is applied, which is correct: they prove the function
 * exists and behaves, and a test that passes before its subject exists would be
 * proving something about itself (§0.7).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const l of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

type Ev = Record<string, unknown>
const at = (iso: string) => `${iso}T00:00:00Z`
let n = 0
const ev = (kind: string, recorded: string, extra: Ev = {}): Ev => ({
  id: `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}`,
  kind,
  recorded_at: at(recorded),
  occurred_at: at(recorded),
  source: 'web_form',
  evidence: {},
  ...extra,
})

async function resolve(events: Ev[]): Promise<{ state: string; segment?: string }> {
  const { data, error } = await db.rpc('resolve_consent_state', { events })
  if (error) throw new Error(`resolve_consent_state failed: ${error.message}`)
  return data as { state: string; segment?: string }
}

test('RULE 1: an objection is permanent — a consent appended after it changes nothing', async () => {
  // The rule most likely to be quietly broken by a future edit, and the one
  // where being wrong means messaging someone who told us to stop.
  const r = await resolve([
    ev('objection', '2026-01-01', { source: 'whatsapp_reply' }),
    ev('consent_given', '2026-06-01'),
  ])
  assert.equal(r.state, 'objected', 'a later consent must never overturn an objection')
})

test('RULE 1 holds whatever the order the events arrive in', async () => {
  const r = await resolve([
    ev('consent_given', '2026-06-01'),
    ev('objection', '2026-01-01', { source: 'whatsapp_reply' }),
  ])
  assert.equal(r.state, 'objected')
})

test('RULE 1 is not expirable: an objection from years ago still stands', async () => {
  const r = await resolve([
    ev('objection', '2019-03-02', { source: 'meta_block' }),
    ev('consent_given', '2026-09-01'),
    ev('declared', '2026-09-02', { segment: 'A' }),
  ])
  assert.equal(r.state, 'objected')
})

test('a dated consent resolves to consented', async () => {
  const r = await resolve([ev('consent_given', '2026-03-01')])
  assert.equal(r.state, 'consented')
})

test('a withdrawal after a consent means it is no longer consented', async () => {
  const r = await resolve([
    ev('consent_given', '2026-03-01'),
    ev('consent_withdrawn', '2026-08-01', { source: 'whatsapp_reply' }),
  ])
  assert.notEqual(r.state, 'consented')
})

test('a fresh consent after an old withdrawal does resolve — withdrawal is not objection', async () => {
  // The asymmetry is deliberate and worth pinning: withdrawing consent is not
  // the same act as objecting, and only one of them is permanent.
  const r = await resolve([
    ev('consent_given', '2026-01-01'),
    ev('consent_withdrawn', '2026-02-01', { source: 'whatsapp_reply' }),
    ev('consent_given', '2026-08-01'),
  ])
  assert.equal(r.state, 'consented')
})

test('a bare claim is claimed_unevidenced, which is NOT a weaker consent', async () => {
  const r = await resolve([ev('claimed', '2026-09-08', { source: 'import_declaration' })])
  assert.equal(r.state, 'claimed_unevidenced')
  assert.notEqual(r.state, 'consented')
})

test('a quarantined claim is still a claim — it is worth asking the agency about', async () => {
  const r = await resolve([ev('quarantined', '2026-09-08', { source: 'import_declaration' })])
  assert.equal(r.state, 'claimed_unevidenced')
})

test('a revoked claim falls through to undetermined, not to claimed_unevidenced', async () => {
  // §7.2: the agency undid that import. There is nothing left to ask them.
  const batch = { batch_id: '22222222-2222-2222-2222-222222222222' }
  const r = await resolve([
    ev('claimed', '2026-09-08', { source: 'import_declaration', evidence: batch }),
    ev('claim_revoked', '2026-09-09', { source: 'operator', evidence: batch }),
  ])
  assert.equal(r.state, 'undetermined')
})

test('a revocation of a DIFFERENT batch leaves the claim standing', async () => {
  const r = await resolve([
    ev('claimed', '2026-09-08', { source: 'import_declaration', evidence: { batch_id: 'aaaaaaaa-0000-0000-0000-000000000001' } }),
    ev('claim_revoked', '2026-09-09', { source: 'operator', evidence: { batch_id: 'bbbbbbbb-0000-0000-0000-000000000002' } }),
  ])
  assert.equal(r.state, 'claimed_unevidenced')
})

test('a declaration carries its segment', async () => {
  const r = await resolve([ev('declared', '2026-09-10', { segment: 'A', source: 'agency_attestation' })])
  assert.equal(r.state, 'declared')
  assert.equal(r.segment, 'A')
})

test('no events at all is undetermined, and says so rather than returning nothing', async () => {
  assert.equal((await resolve([])).state, 'undetermined')
})

test('the states are exactly the five in the design, and nothing else appears', async () => {
  const seen = new Set<string>()
  for (const events of [
    [ev('objection', '2026-01-01')],
    [ev('consent_given', '2026-01-01')],
    [ev('declared', '2026-01-01', { segment: 'B' })],
    [ev('claimed', '2026-01-01')],
    [],
  ]) seen.add((await resolve(events)).state)
  assert.deepEqual(
    [...seen].sort(),
    ['claimed_unevidenced', 'consented', 'declared', 'objected', 'undetermined'],
  )
})
