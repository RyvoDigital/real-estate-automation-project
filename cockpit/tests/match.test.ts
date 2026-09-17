/*
 * The reconciliation matcher.
 *
 * The case this file exists for is the Concierge reply: the only lookup Twilio
 * offers is To + From + a time range, the Concierge shares the number, and a
 * contact who answers a campaign message gets a reply within seconds — inside
 * the window. Matching on recipient and time alone would complete a send row
 * with the provider id of "Claro, qual é o seu horizonte temporal?" and claim a
 * marketing template went out.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchSend, findOrphans, type ProviderMessage, type UnresolvedRow } from '../src/lib/send/match'

const TEMPLATE = 'Olá Maria, fala a Ana da Cascais Demo. Já passou algum tempo desde que tratámos da sua casa em Cascais.'
const ROW: UnresolvedRow = {
  phoneE164: '+351912345678',
  clientNumber: '+351912000001',
  bodyIntended: TEMPLATE,
  intentRecordedAt: '2026-09-22T09:03:11.331Z',
}
const msg = (over: Partial<ProviderMessage> = {}): ProviderMessage => ({
  sid: 'SM1', to: ROW.phoneE164, from: ROW.clientNumber, body: TEMPLATE,
  dateSent: '2026-09-22T09:03:12.918Z', direction: 'outbound-api', ...over,
})

test('an exact body match inside the window resolves', () => {
  const r = matchSend(ROW, [msg({ sid: 'SMreal' })])
  assert.equal(r.kind, 'resolved')
  if (r.kind === 'resolved') assert.equal(r.message.sid, 'SMreal')
})

test('THE CONCIERGE REPLY: right number, right window, wrong body — must NOT match', () => {
  const r = matchSend(ROW, [
    msg({ sid: 'SMreply', body: 'Claro, qual é o seu horizonte temporal?', dateSent: '2026-09-22T09:04:02.000Z' }),
    msg({ sid: 'SMreply2', body: 'Perfeito. Um colega confirma consigo.', dateSent: '2026-09-22T09:06:40.000Z' }),
  ])
  assert.equal(r.kind, 'unresolved', 'a Concierge reply was accepted as the campaign message')
  if (r.kind === 'unresolved') {
    assert.equal(r.diagnosis.inWindow, 2, 'both replies were seen…')
    assert.equal(r.diagnosis.bodyExact, 0, '…and neither carried the template')
    assert.match(r.detail, /Concierge replies/, 'the detail must name the likely cause')
  }
})

test('direction does not discriminate, which is why the body has to', () => {
  // The Concierge sends through the same REST API, so its replies are
  // outbound-api exactly as a campaign message is. Asserting it so nobody
  // "optimises" the matcher by filtering on direction.
  const r = matchSend(ROW, [msg({ sid: 'SMc', body: 'outra coisa', direction: 'outbound-api' })])
  assert.equal(r.kind, 'unresolved')
})

test('two exact matches are ambiguous, never resolved — we sent twice', () => {
  const r = matchSend(ROW, [msg({ sid: 'SMa' }), msg({ sid: 'SMb', dateSent: '2026-09-22T09:05:00.000Z' })])
  assert.equal(r.kind, 'ambiguous')
  if (r.kind === 'ambiguous') {
    assert.equal(r.messages.length, 2)
    assert.match(r.detail, /never-retry rule was broken/)
    assert.match(r.detail, /Do not resolve this row automatically/)
  }
})

test('exact means exact: whitespace, case and punctuation differences do not match', () => {
  for (const body of [
    TEMPLATE + '\n',
    ' ' + TEMPLATE,
    TEMPLATE.toLowerCase(),
    TEMPLATE.replace('Olá', 'Ola'),
    TEMPLATE.replace('.', ''),
  ]) {
    const r = matchSend(ROW, [msg({ body })])
    assert.equal(r.kind, 'unresolved',
      `a near-miss body was accepted: ${JSON.stringify(body.slice(0, 24))}`)
  }
})

test('a message to somebody else is not a candidate at all', () => {
  const r = matchSend(ROW, [msg({ to: '+351999999999' })])
  assert.equal(r.kind, 'unresolved')
  if (r.kind === 'unresolved') {
    assert.equal(r.diagnosis.toRecipient, 0)
    assert.match(r.detail, /listed 1 message\(s\) in this window and none went to/)
  }
})

test('AN EMPTY LISTING IS NOT THE SAME FACT AS AN EMPTY MATCH', () => {
  // This case and the one above both have zero candidates, and the first
  // version of the matcher gave them the same sentence. They are different
  // facts: "40 messages, none to this contact" is evidence, and "no messages at
  // all" is as likely to be a broken query, a malformed window or the wrong
  // account — each of which would look like a clean "nothing was sent" and be
  // recorded as one. §5b, in the place where believing it writes a false row.
  const r = matchSend(ROW, [])
  assert.equal(r.kind, 'unresolved')
  if (r.kind === 'unresolved') {
    assert.equal(r.diagnosis.listed, 0)
    assert.match(r.detail, /NO messages at all/)
    assert.match(r.detail, /as likely to be a broken listing/)
    assert.match(r.detail, /check the query, the window and the account/)
  }
})

test('a message from a different number is not a candidate either', () => {
  // Two clients, two WhatsApp numbers, the same contact. Without the `from`
  // filter this row would be completed with another agency's message.
  const r = matchSend(ROW, [msg({ from: '+351913000002' })])
  assert.equal(r.kind, 'unresolved')
  if (r.kind === 'unresolved') assert.equal(r.diagnosis.toRecipient, 0)
})

test('an exact body outside the window says the window is wrong, not the send', () => {
  const r = matchSend(ROW, [msg({ sid: 'SMlate', dateSent: '2026-09-22T11:30:00.000Z' })])
  assert.equal(r.kind, 'unresolved')
  if (r.kind === 'unresolved') {
    assert.equal(r.diagnosis.bodyExactOutsideWindow, 1)
    assert.match(r.detail, /window is probably wrong, not the send/)
  }
})

test('the window is generous before as well as after', () => {
  // Clock skew between our clock and the provider's is real, and a message
  // stamped a minute BEFORE our intent row is still ours.
  const r = matchSend(ROW, [msg({ dateSent: '2026-09-22T09:02:20.000Z' })])
  assert.equal(r.kind, 'resolved')
})

test('an unresolved result always says which kind of nothing it is (§5b)', () => {
  const cases: ProviderMessage[][] = [
    [],
    [msg({ to: '+351999999999' })],
    [msg({ body: 'algo diferente' })],
    [msg({ dateSent: '2026-09-22T11:30:00.000Z' })],
  ]
  const details = new Set<string>()
  for (const messages of cases) {
    const r = matchSend(ROW, messages)
    assert.equal(r.kind, 'unresolved')
    if (r.kind === 'unresolved') {
      assert.ok(r.detail.length > 30, 'every unresolved result needs a usable sentence')
      details.add(r.detail)
    }
  }
  assert.equal(details.size, cases.length, 'four different kinds of nothing produced the same sentence')
})

test('ORPHANS: an outbound template with no send row is the gate being bypassed', () => {
  const orphans = findOrphans({
    messages: [
      msg({ sid: 'SMknown' }),
      msg({ sid: 'SMorphan', body: TEMPLATE }),
      msg({ sid: 'SMreply', body: 'Claro, qual é o seu horizonte temporal?' }),
    ],
    knownProviderIds: new Set(['SMknown']),
    looksLikeTemplate: (b) => b === TEMPLATE,
  })
  assert.equal(orphans.length, 1)
  assert.equal(orphans[0].sid, 'SMorphan')
})

test('ORPHANS: a free-form reply with no send row is expected, not an orphan', () => {
  // The Concierge replies constantly and has no send rows. If those counted as
  // orphans the alert would fire every few minutes and be turned off within a
  // week, which is how a critical alert becomes noise (§9).
  const orphans = findOrphans({
    messages: [msg({ sid: 'SMreply', body: 'Perfeito, combinado.' })],
    knownProviderIds: new Set(),
    looksLikeTemplate: (b) => b === TEMPLATE,
  })
  assert.deepEqual(orphans, [])
})

test('THE CHANNEL PREFIX: provider addresses are whatsapp:-prefixed and ours are not', async () => {
  // Caught by a dry run, before anything was scheduled. `From=+14155238886`
  // returns HTTP 200 and zero messages; `From=whatsapp:+14155238886` returns
  // the traffic. The wrong one is not an error — it is a clean, confident,
  // permanently empty result, and the orphan sweep would have reported "all
  // accounted for" every night while examining nothing.
  const { toChannelAddress, stripChannelAddress } = await import('../src/lib/send/provider-address')

  assert.equal(toChannelAddress('+14155238886'), 'whatsapp:+14155238886')
  assert.equal(toChannelAddress('whatsapp:+14155238886'), 'whatsapp:+14155238886', 'idempotent')
  assert.equal(stripChannelAddress('whatsapp:+351912345678'), '+351912345678')
  assert.equal(stripChannelAddress('+351912345678'), '+351912345678', 'a bare number survives')

  // And the round trip, because the matcher compares the stripped form against
  // sends.phone_e164 — one direction alone would still leave every row
  // unresolved for ever.
  assert.equal(stripChannelAddress(toChannelAddress('+351912345678')), '+351912345678')
})
