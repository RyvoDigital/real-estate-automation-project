/*
 * The Twilio adapter — the one file that can cause a message to exist.
 *
 * `fetch` is injected, so nothing here reaches the network and every branch is
 * a test. The credential is read from the environment, so the tests supply
 * placeholders: what is under test is the request built and the response
 * mapped, not the account.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { twilioAdapter } from '../src/lib/send/twilio-adapter'

process.env.TWILIO_ACCOUNT_SID ||= 'ACtest'
process.env.TWILIO_SEND_KEY_SID ||= 'SKtest'
process.env.TWILIO_SEND_KEY_SECRET ||= 'secret'

type Captured = { url: string; init: RequestInit; form: URLSearchParams }
function capturing(reply: { status: number; json: unknown }) {
  const calls: Captured[] = []
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const form = new URLSearchParams(String(init?.body ?? ''))
    calls.push({ url: String(url), init: init ?? {}, form })
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      json: async () => reply.json,
    } as Response
  }) as unknown as typeof fetch
  return { calls, adapter: twilioAdapter({ fetchImpl }) }
}

const INPUT = {
  to: '+351912345678',
  from: '+14155238886',
  contentSid: 'HXabc123',
  variables: { '1': 'Maria', '2': 'Cascais' },
  body: 'Olá Maria, … em Cascais.',
  templateName: 'reactivacao_a_1',
}

test('BOTH addresses are channel-prefixed, so error 21910 cannot arise', () => {
  // A bare To with a whatsapp: From is "Invalid 'From' and 'To' pair" — loud,
  // unlike the reader's bare-E.164 query which returns 200 and nothing. A
  // converted pair cannot produce either.
  const { calls, adapter } = capturing({ status: 201, json: { sid: 'SM1', body: 'x' } })
  return adapter.send(INPUT).then(() => {
    assert.equal(calls[0].form.get('To'), 'whatsapp:+351912345678')
    assert.equal(calls[0].form.get('From'), 'whatsapp:+14155238886')
  })
})

test('it sends a ContentSid with variables, not a free-form body', async () => {
  const { calls, adapter } = capturing({ status: 201, json: { sid: 'SM1', body: 'x' } })
  await adapter.send(INPUT)
  assert.equal(calls[0].form.get('ContentSid'), 'HXabc123')
  assert.deepEqual(JSON.parse(calls[0].form.get('ContentVariables')!), { '1': 'Maria', '2': 'Cascais' })
  assert.equal(calls[0].form.get('Body'), null,
    'outside the 24-hour window WhatsApp carries approved templates only')
})

test('the body recorded comes from the API, not from our copy', async () => {
  const { adapter } = capturing({
    status: 201,
    json: { sid: 'SMreal', body: 'Olá Maria, fala a Sofia. … em Cascais.' },
  })
  const r = await adapter.send(INPUT)
  assert.equal(r.accepted, true)
  if (r.accepted) {
    assert.equal(r.bodySent, 'Olá Maria, fala a Sofia. … em Cascais.')
    assert.notEqual(r.bodySent, INPUT.body,
      'the wire copy and our copy are different strings here on purpose: backfilling ours ' +
      'would make the record agree with itself by construction')
  }
})

test('an empty body from the API is passed through, not backfilled', async () => {
  const { adapter } = capturing({ status: 201, json: { sid: 'SM1' } })
  const r = await adapter.send(INPUT)
  assert.equal(r.accepted, true)
  if (r.accepted) assert.equal(r.bodySent, '', 'a finding, not a default')
})

test('429 is the one retryable answer', async () => {
  const { adapter } = capturing({ status: 429, json: { code: 63018, message: 'Rate limit' } })
  const r = await adapter.send(INPUT)
  assert.equal(r.accepted, false)
  if (!r.accepted) {
    assert.equal(r.retryable, 'later')
    assert.match(r.error, /63018/)
  }
})

test('a 4xx is terminal and carries the Twilio code, which is what diagnoses it', async () => {
  const { adapter } = capturing({ status: 400, json: { code: 21910, message: "Invalid 'From' and 'To' pair" } })
  const r = await adapter.send(INPUT)
  assert.equal(r.accepted, false)
  if (!r.accepted) {
    assert.equal(r.retryable, 'never')
    assert.match(r.error, /21910/)
    assert.match(r.error, /Invalid 'From' and 'To' pair/)
  }
})

test('a 5xx THROWS rather than returning a failure, because it is not an answer', async () => {
  // Twilio saying it failed does not say whether it accepted first. dispatch
  // treats a throw as ambiguous and leaves the row `intended` for
  // reconciliation; returning `failed` would record a definite outcome we do
  // not have.
  const { adapter } = capturing({ status: 503, json: { message: 'Service unavailable' } })
  await assert.rejects(() => adapter.send(INPUT), /Twilio 503/)
})

test('a network error THROWS: silence is never a refusal', async () => {
  const fetchImpl = (async () => { throw new Error('ETIMEDOUT') }) as unknown as typeof fetch
  await assert.rejects(() => twilioAdapter({ fetchImpl }).send(INPUT), /no answer from Twilio/)
})

test('THE ADAPTER HAS NO ROUTE TO A RECIPIENT OF ITS OWN', () => {
  const src = readFileSync(new URL('../src/lib/send/twilio-adapter.ts', import.meta.url), 'utf8')
    .split('\n').filter((l) => {
      const s = l.trimStart()
      return !s.startsWith('//') && !s.startsWith('*') && !s.startsWith('/*')
    }).join('\n')

  // It reads no table, so it cannot find anybody.
  for (const forbidden of [/supabase/i, /from\('/, /admin\(/, /select\(/]) {
    assert.equal(forbidden.test(src), false,
      `the adapter references ${forbidden} — given only the credential it must not be able to name a single person`)
  }
  // And every address it uses arrives as an argument.
  assert.match(src, /To: toChannelAddress\(input\.to\)/)
  assert.match(src, /From: toChannelAddress\(input\.from\)/)
  // NOT an assertion about HOW credentials are read. The first version required
  // them to go through `required()`, which is an implementation detail — and it
  // failed the moment `isConfigured()` read the environment directly, for a
  // change that strengthened the boundary rather than weakening it. A test that
  // pins the shape of correct code fights the next correct change.
  //
  // The property is that no RECIPIENT can originate here, and that is what the
  // two assertions above check.
  assert.match(src, /isConfigured/,
    'the adapter answers whether it is configured, so no other file has to name the credential')
})
