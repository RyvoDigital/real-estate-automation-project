/*
 * The four dispatch outcomes, against real rows with an injected provider.
 *
 * The rule under test: THE PATH NEVER RETRIES AN AMBIGUOUS OUTCOME, AND SILENCE
 * IS ALWAYS AMBIGUOUS. Twilio has no idempotency key on message creation
 * (checked 17 Sep 2026), so a retry after silence is not "probably safe" — it
 * is a second message to somebody whose consent is the entire product.
 *
 * `sends` is an ordinary table, not the append-only ledger, so these rows are
 * deleted afterwards. The number used is real and non-reserved, because
 * dispatch refuses the reserved range outright — proved in one-sender and gate.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import {
  dispatch, RETRY_DELAYS_MS, MAX_ATTEMPTS,
  type ProviderAdapter, type SendStore,
} from '../src/lib/send/dispatch'

for (const l of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]
}
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)
const PHONE = '+351911111111'
const made: string[] = []

after(async () => { if (made.length) await db.from('sends').delete().in('id', made) })

/**
 * A fully authorised intent row.
 *
 * THE FIRST VERSION OF THIS FIXTURE COULD NOT REACH `sent`, AND THAT IS THE
 * CONSTRAINTS WORKING. It carried a permission and a basis but no
 * consent_event_id and no policy confirmation, so `send_requires_permission`
 * and `send_requires_confirmed_policy` refused the UPDATE to 'sent' — 0015's
 * invariants 1 and 2, enforced against a test rather than only against
 * production. The fixture had to be made compliant before it could pass, which
 * is the property holding on us as well as on the product.
 *
 * So the consent event is a REAL row from the ledger rather than an invented
 * uuid: the foreign key would refuse an invented one, and a fixture that can
 * only exist by satisfying the same rules as a real send is worth more than one
 * that is waved through.
 */
async function intendedRow(key: string): Promise<string> {
  const { data: c } = await db.from('clients').select('id').limit(1).single()
  const { data: ev, error: evErr } = await db.from('consent_events')
    .select('id, occurred_at')
    .eq('client_id', c!.id)
    .eq('kind', 'consent_given')
    .limit(1).maybeSingle()
  assert.equal(evErr, null, evErr?.message ?? 'consent event read failed')
  assert.ok(ev, 'no consent_given event to hang the fixture on — the ledger fixtures are missing')

  const { data, error } = await db.from('sends').insert({
    client_id: c!.id, phone_e164: PHONE, automation: 'dispatch_test',
    idempotency_key: key, status: 'intended',
    gate_verdict: 'permitted', gate_basis: 'documented consent · PT',
    gate_decided_at: new Date().toISOString(), country: 'PT', segment: 'B',
    // invariant 1: a send needs the ledger row it relied on
    consent_event_id: ev!.id, consent_occurred_at: ev!.occurred_at,
    // invariant 2: and a jurisdiction a named human confirmed
    policy_country: 'PT',
    policy_confirmed_at: new Date().toISOString(),
    policy_confirmed_by: 'FIXTURE — not a real confirmation',
    body_intended: 'test body',
  }).select('id').single()
  assert.equal(error, null, error?.message ?? 'insert failed')
  made.push(data!.id as string)
  return data!.id as string
}

/** dispatch() re-reads the row, so the permit only has to carry matching values. */
function permitFor(sendId: string, key: string) {
  return { sendId, idempotencyKey: key, to: PHONE, body: 'test body', templateName: 'tpl' } as never
}
/**
 * The store, over the real table, so the row really is re-read and the patches
 * really are written — but dispatch itself is handed the store rather than
 * reaching for one, which is what makes this file importable at all.
 */
const store: SendStore = {
  async read(sendId) {
    const { data, error } = await db.from('sends')
      .select('id, status, idempotency_key, gate_verdict, phone_e164, attempts')
      .eq('id', sendId).maybeSingle()
    // The first version of this dropped `error` and returned null, so a FAILED
    // QUERY was indistinguishable from a missing row -- and dispatch faithfully
    // reported "no send row for permit …" while the row was sitting there. §5b
    // in the test harness itself, which is where it is hardest to notice.
    if (error) throw new Error(`test store read failed (is 0017 applied?): ${error.message}`)
    return (data as Awaited<ReturnType<SendStore['read']>>) ?? null
  },
  async update(sendId, patch) {
    const { error } = await db.from('sends').update(patch).eq('id', sendId)
    if (error) throw new Error(error.message)
  },
}

async function run(sendId: string, key: string, provider: ProviderAdapter) {
  const slept: number[] = []
  const out = await dispatch(permitFor(sendId, key), {
    provider, store, sleep: async (ms: number) => { slept.push(ms) },
  })
  const { data } = await db.from('sends').select('*').eq('id', sendId).single()
  return { out, row: data!, slept }
}

test('accepted: the row becomes sent, with the provider id and the body from the WIRE', async () => {
  const key = `disp-ok-${Date.now()}`
  const id = await intendedRow(key)
  const { out, row } = await run(id, key, {
    async send() { return { accepted: true, providerMessageId: 'SMtest1', bodySent: 'test body' } },
  })
  assert.equal(out.kind, 'sent')
  assert.equal(row.status, 'sent')
  assert.equal(row.provider_message_id, 'SMtest1')
  assert.equal(row.body_sent, 'test body', 'body_sent comes from the provider, not from our variable')
  assert.equal(row.attempts, 1)
})

test('a 4xx rejection is terminal: failed, ONE attempt, no retry', async () => {
  const key = `disp-4xx-${Date.now()}`
  const id = await intendedRow(key)
  let calls = 0
  const { out, row, slept } = await run(id, key, {
    async send() { calls++; return { accepted: false, retryable: 'never', error: '63016 template not approved' } },
  })
  assert.equal(out.kind, 'failed')
  assert.equal(calls, 1, 'a rejection must not be retried — the same content fails identically')
  assert.deepEqual(slept, [])
  assert.equal(row.status, 'failed')
  assert.equal(row.attempts, 1)
  assert.match(row.error, /63016/)
})

test('SILENCE: the row stays intended, ONE attempt, and nothing is retried', async () => {
  // The most important test in this file. A timeout may mean the message was
  // accepted and delivered. Retrying it would send a second one.
  const key = `disp-silent-${Date.now()}`
  const id = await intendedRow(key)
  let calls = 0
  const { out, row, slept } = await run(id, key, {
    async send() { calls++; throw new Error('ETIMEDOUT after 30000ms') },
  })
  assert.equal(out.kind, 'ambiguous')
  assert.equal(calls, 1, 'silence must NEVER be retried')
  assert.deepEqual(slept, [], 'and must not even wait, because it is not going to try again')
  assert.equal(row.status, 'intended', 'the row stays a question someone can answer')
  assert.equal(row.sent_at, null)
  assert.equal(row.failed_at, null)
  assert.match(row.last_error, /no answer from provider/)
  assert.equal(row.attempts, 1)
})

test('429 is the one retryable answer: bounded at 3, backing off 2s/8s/32s', async () => {
  const key = `disp-429-${Date.now()}`
  const id = await intendedRow(key)
  let calls = 0
  const { out, row, slept } = await run(id, key, {
    async send() { calls++; return { accepted: false, retryable: 'later', error: '429 too many requests' } },
  })
  assert.equal(calls, MAX_ATTEMPTS, `expected ${MAX_ATTEMPTS} attempts`)
  assert.equal(calls, 3)
  assert.deepEqual(slept, RETRY_DELAYS_MS.slice(0, 2), 'waits between attempts, never after the last')
  assert.equal(out.kind, 'rate_limited')
  assert.equal((out as { haltBatch: true }).haltBatch, true,
    'a 429 is a property of the ACCOUNT, so the batch halts rather than moving to the next contact')
  assert.equal(row.status, 'intended', 'exhausting the bound leaves a question, not a lost send')
  assert.equal(row.attempts, 3)
})

test('a 429 that clears mid-way sends, and the attempt count records the struggle', async () => {
  const key = `disp-429ok-${Date.now()}`
  const id = await intendedRow(key)
  let calls = 0
  const { out, row } = await run(id, key, {
    async send() {
      calls++
      if (calls < 3) return { accepted: false, retryable: 'later', error: '429' }
      return { accepted: true, providerMessageId: 'SMlate', bodySent: 'test body' }
    },
  })
  assert.equal(out.kind, 'sent')
  assert.equal(row.status, 'sent')
  assert.equal(row.attempts, 3)
  assert.match(row.last_error, /429/, 'the last error stays, because it happened')
})

test('a forged permit cannot dispatch: the row is re-read and disagrees', async () => {
  const key = `disp-forge-${Date.now()}`
  const id = await intendedRow(key)
  const provider: ProviderAdapter = {
    async send() { throw new Error('the provider must never be reached') },
  }
  // A cast can forge the object. It cannot forge the row it points at.
  await assert.rejects(
    () => dispatch({ sendId: id, idempotencyKey: 'not-the-key', to: PHONE, body: 'x', templateName: 't' } as never, { provider, store }),
    /idempotency key mismatch/,
  )
  await assert.rejects(
    () => dispatch({ sendId: '00000000-0000-0000-0000-000000000000', idempotencyKey: key, to: PHONE, body: 'x', templateName: 't' } as never, { provider, store }),
    /no send row for permit/,
  )
})

test('a row that already sent cannot be dispatched again', async () => {
  const key = `disp-twice-${Date.now()}`
  const id = await intendedRow(key)
  await run(id, key, { async send() { return { accepted: true, providerMessageId: 'SMonce', bodySent: 'test body' } } })
  await assert.rejects(
    () => dispatch(permitFor(id, key), {
      provider: { async send() { throw new Error('must not be reached') } }, store,
    }),
    /row is "sent", not "intended"/,
    'the status check is what stops a double send through the same row',
  )
})
