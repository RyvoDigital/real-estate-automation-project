/*
 * The suppression WRITE path, against the real database.
 *
 * This is the test the append-only ledger made awkward: it cannot clean up
 * after itself, because consent_events refuses DELETE and rollback needs a
 * Postgres session PostgREST does not give us. So it writes to the reserved
 * range (+351900000xxx), whose rows are permanent fixtures by decision, and
 * which the send gate refuses outright — the refusal being what makes a
 * permanent fixture safe rather than a convention (../src/lib/reserved-numbers.ts).
 *
 * WRITE ONCE, VERIFY FOR EVER
 * Each fixture is written only if it is not already there, so the ledger gains
 * a bounded number of rows however many times this runs. The first run proves
 * the write; every run after it proves the read and the derivation. The test
 * says which mode it ran in rather than leaving that to be guessed.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { RESERVED_FIXTURES, isReservedTestNumber } from '../src/lib/reserved-numbers'

for (const l of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
}
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

const PURE: string = RESERVED_FIXTURES.objected                  // objection only
const RULE1: string = RESERVED_FIXTURES.objectedThenConsented    // objection, then consent
let clientId: string

/** Write-once. Append-only means a careless test grows the table for ever. */
async function ensureRow(phone: string, kind: string, row: Record<string, unknown>) {
  const { data, error } = await db
    .from('consent_events')
    .select('id')
    .eq('client_id', clientId)
    .eq('phone_e164', phone)
    .eq('kind', kind)
  if (error) throw new Error(error.message)
  if ((data ?? []).length > 0) return { wrote: false, count: data!.length }
  const ins = await db.from('consent_events').insert({ client_id: clientId, phone_e164: phone, kind, ...row })
  if (ins.error) throw new Error(ins.error.message)
  return { wrote: true, count: 1 }
}

test('a client exists to hang the fixture on', async () => {
  const { data, error } = await db.from('clients').select('id').limit(1).single()
  assert.equal(error, null, error?.message ?? 'read failed')
  clientId = data!.id as string
  assert.ok(clientId)
})

test('every fixture number really is in the reserved range', () => {
  // If this fails, the test is about to write a permanent row against a number
  // that is not protected by the gate's refusal. It must stop first.
  for (const [name, phone] of Object.entries(RESERVED_FIXTURES)) {
    assert.equal(isReservedTestNumber(phone), true, `${name} (${phone}) is NOT reserved — refusing to write`)
  }
})

test('the objection write path works, and the pure fixture stays pure', async () => {
  const r = await ensureRow(PURE, 'objection', {
    occurred_at: new Date().toISOString(),
    source: 'whatsapp_reply',
    wording: 'SAIR',
    evidence: { matched: 'keyword:sair', fixture: 'objected' },
    jurisdiction: 'PT',
    note: 'Reserved-range fixture. Proves the objection write path; the gate refuses this range.',
  })
  console.log(`    ${PURE}: ${r.wrote ? 'WROTE the objection (first run)' : 'already present — verifying only'}`)

  const { data } = await db.from('consent_events').select('kind').eq('client_id', clientId).eq('phone_e164', PURE)
  assert.ok((data ?? []).length > 0, 'no objection row')
  assert.ok((data ?? []).every((x) => x.kind === 'objection'),
    'the pure fixture gained a non-objection row — some test is writing where it must not')
})

test('the derivation reports objected, through the view a gate would read', async () => {
  const { data, error } = await db
    .from('consent_by_contact').select('state')
    .eq('client_id', clientId).eq('phone_e164', PURE).single()
  assert.equal(error, null, error?.message ?? 'read failed')
  assert.equal(data!.state, 'objected')
})

test('RULE 1 against real rows: a consent appended after an objection changes nothing', async () => {
  // consent-resolution.test.ts proves this on synthetic events through the pure
  // function. This proves the same rule end to end -- a real insert into a real
  // table, out of the real view -- which is lesson 9c's point about proving a
  // guard on each path it actually governs.
  await ensureRow(RULE1, 'objection', {
    occurred_at: new Date().toISOString(), source: 'whatsapp_reply', wording: 'SAIR',
    evidence: { fixture: 'objectedThenConsented' }, jurisdiction: 'PT',
  })
  await ensureRow(RULE1, 'consent_given', {
    occurred_at: new Date().toISOString(), source: 'web_form',
    wording: 'fixture: consent appended AFTER an objection, which must not resurrect the contact',
    evidence: { fixture: 'objectedThenConsented', proves: 'rule 1' }, jurisdiction: 'PT',
  })

  const { data } = await db
    .from('consent_by_contact').select('state')
    .eq('client_id', clientId).eq('phone_e164', RULE1).single()
  assert.equal(data!.state, 'objected', 'a consent after an objection resurrected the contact')
})

test('a contact nobody has said anything about is not suppressed', async () => {
  const { data } = await db
    .from('consent_by_contact')
    .select('state')
    .eq('client_id', clientId)
    .eq('phone_e164', RESERVED_FIXTURES.untouched)
    .maybeSingle()
  assert.equal(data, null, 'an unknown contact must have no row, not a defaulted one')
})
