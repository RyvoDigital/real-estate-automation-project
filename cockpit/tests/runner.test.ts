/*
 * The campaign runner — phase 2.
 *
 * Every port is injected, so the whole walk is a test with no database and no
 * network. The cases that matter most are the four settled with the operator:
 * interruption, pacing as refusal, walk order, and what a late refusal means.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runCampaign, walkOrder, lateRefusalLimit, type RunnerPorts, type RunnerContact } from '../src/lib/send/runner'
import type { ConsentFacts } from '../src/lib/gate'
import type { PolicyRow } from '../src/lib/jurisdiction-policy'

const PT: PolicyRow = {
  country: 'PT', existing_customer: 'available', consent_request: 'permitted',
  consent_expiry_months: null, platform_blocked: false, platform_note: null,
  statute: 'Lei n.º 41/2004', authority: 'CNPD', traps: null, obligation_codes: ['pt_13b_lists'],
  confirmed_at: '2026-09-20T00:00:00Z', confirmed_by: 'M. de Sousa Pereira',
}
const consented: ConsentFacts = {
  state: 'consented', segment: null, occurred_at: '2026-08-01T00:00:00Z', event_id: 'e1',
}
const objected: ConsentFacts = { state: 'objected', segment: null, occurred_at: null, event_id: 'o1' }

function contacts(n: number): RunnerContact[] {
  return Array.from({ length: n }, (_, i) => ({ phone: `+35191234${String(i).padStart(4, '0')}` }))
}

type Recorded = { phone: string; layer: string; reason: string; detail: string }
function ports(over: Partial<RunnerPorts> = {}) {
  const refusals: Recorded[] = []
  const sentTo: string[] = []
  const halts: string[] = []
  const base: RunnerPorts = {
    async consentFor() { return consented },
    async policyFor() { return PT },
    async history() { return { sentAt: [] } },
    async sentToday() { return 0 },
    async alreadyHandled() { return false },
    async qualityRating() { return 'HIGH' },
    async recordRefusal(r) { refusals.push({ phone: r.phone, layer: r.layer, reason: r.reason, detail: r.detail }) },
    async send({ contact }) { sentTo.push(contact.phone); return { kind: 'sent' } },
    async halt(reason) { halts.push(reason) },
    ...over,
  }
  return { ports: base, refusals, sentTo, halts }
}

test('the happy path sends to everybody permitted', async () => {
  const p = ports()
  const out = await runCampaign({ contacts: contacts(5), forecastPermitted: 5, ports: p.ports })
  assert.equal(out.sent, 5)
  assert.equal(p.sentTo.length, 5)
})

// --- 1. interruption -------------------------------------------------------

test('INTERRUPTION: a second invocation skips what the first already handled', async () => {
  // The process died at contact 3 of 5. Fourteen-of-thirty in miniature.
  const done = new Set(['+351912340000', '+351912340001', '+351912340002'])
  const p = ports({ async alreadyHandled(phone) { return done.has(phone) } })
  const out = await runCampaign({ contacts: contacts(5), forecastPermitted: 5, ports: p.ports })
  assert.equal(out.skippedAlreadyHandled, 3)
  assert.equal(out.sent, 2, 'it continues from where the record says it stopped')
  assert.deepEqual(p.sentTo.sort(), ['+351912340003', '+351912340004'])
})

test('a row in ANY status counts as handled, including `intended`', async () => {
  // A row left at `intended` may already have been accepted by Twilio, which
  // has no idempotency on create. Re-dispatching it is how one person receives
  // two messages. It belongs to reconciliation, not to the runner.
  const p = ports({ async alreadyHandled() { return true } })
  const out = await runCampaign({ contacts: contacts(4), forecastPermitted: 4, ports: p.ports })
  assert.equal(out.sent, 0)
  assert.equal(out.skippedAlreadyHandled, 4)
  assert.equal(p.sentTo.length, 0)
})

test('there is no resume entry point: the signature offers no cursor', () => {
  // The record IS the cursor. If this ever grows a startFrom or a checkpoint,
  // that parameter is the resume path this design refuses to have.
  const src = String(runCampaign)
  assert.equal(/startFrom|resumeAt|checkpoint|offset/i.test(src), false,
    'runCampaign has grown a cursor argument — the record of what was done must be the only one')
})

// --- 2. pacing as refusal ---------------------------------------------------

test('PACING REFUSALS ARE ROWS, not silent skips', async () => {
  const p = ports({
    async history(phone) {
      return phone === '+351912340001'
        ? { sentAt: [new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString()] }
        : { sentAt: [] }
    },
  })
  const out = await runCampaign({ contacts: contacts(3), forecastPermitted: 3, ports: p.ports })
  assert.equal(out.sent, 2)
  assert.equal(out.refusedPacing, 1)
  const row = p.refusals.find((r) => r.phone === '+351912340001')
  assert.ok(row, 'the skipped contact must leave a row')
  assert.equal(row!.layer, 'pacing')
  assert.equal(row!.reason, 'touched_this_week')
  assert.match(row!.detail, /Last messaged 2\.0 days ago/)
  assert.match(row!.detail, /fastest route to a block/,
    'the reason must read as an explanation rather than a code')
})

test('the DAILY CAP ends the day instead of writing the same row about everybody', async () => {
  const p = ports({ async sentToday() { return 30 } })
  const out = await runCampaign({ contacts: contacts(300), forecastPermitted: 300, ports: p.ports })
  assert.equal(out.dayEnded, true)
  assert.equal(out.sent, 0)
  assert.equal(p.refusals.length, 0,
    'three hundred identical rows about the clock is not a record, it is noise')
  assert.equal(out.halted, false, 'the day ending is not a halt — tomorrow it continues')
})

// --- 3. the walk order ------------------------------------------------------

test('WALK ORDER: most recently engaged first, never-engaged last, phone breaks ties', () => {
  const ordered = walkOrder([
    { phone: '+351900000003', lastContactAt: null },
    { phone: '+351900000002', lastContactAt: '2026-01-01T00:00:00Z' },
    { phone: '+351900000001', lastContactAt: '2026-09-01T00:00:00Z' },
    { phone: '+351900000005', lastContactAt: null },
    { phone: '+351900000004', lastContactAt: '2026-09-01T00:00:00Z' },
  ])
  assert.deepEqual(ordered.map((c) => c.phone), [
    '+351900000001',   // September, and sorts before …004 on phone
    '+351900000004',   // September
    '+351900000002',   // January
    '+351900000003',   // never engaged
    '+351900000005',
  ])
})

test('the order is total, so "which fourteen got it" has one answer', () => {
  // Two runs over the same list in a different input order must walk it the
  // same way, or a halt at fourteen is unanswerable.
  const list = contacts(20).map((c, i) => ({ ...c, lastContactAt: i % 3 === 0 ? null : '2026-09-01T00:00:00Z' }))
  const a = walkOrder(list).map((c) => c.phone)
  const b = walkOrder([...list].reverse()).map((c) => c.phone)
  assert.deepEqual(a, b)
})

// --- 4. late refusals -------------------------------------------------------

test('ONE late refusal is the expected race: recorded, counted, not a halt', async () => {
  const p = ports({
    async consentFor(phone) { return phone === '+351912340002' ? objected : consented },
  })
  const out = await runCampaign({ contacts: contacts(20), forecastPermitted: 20, ports: p.ports })
  assert.equal(out.refusedLate, 1)
  assert.deepEqual(out.lateRefusalsByReason, { objected: 1 })
  assert.equal(out.halted, false)
  assert.equal(out.sent, 19)
  const row = p.refusals.find((r) => r.phone === '+351912340002')
  assert.equal(row!.layer, 'suppression')
})

test('A PATTERN of late refusals halts, naming the dominant reason', async () => {
  // Fifteen of twenty is not a race. Something changed between evaluation and
  // sending, and continuing would send under assumptions already falsified.
  let n = 0
  const p = ports({ async consentFor() { return ++n <= 15 ? objected : consented } })
  const out = await runCampaign({ contacts: contacts(20), forecastPermitted: 20, ports: p.ports })
  assert.equal(out.halted, true)
  assert.equal(out.refusedLate, lateRefusalLimit(20) + 1, 'it halts as soon as it passes the threshold')
  assert.match(out.haltedReason!, /objected/, 'the dominant reason is named')
  assert.match(out.haltedReason!, /the world moved between evaluation and sending/)
  assert.match(out.haltedReason!, /Re-evaluate rather than resume/)
  assert.equal(p.halts.length, 1)
})

test('the threshold has a floor, so a tiny campaign does not halt on one race', () => {
  assert.equal(lateRefusalLimit(5), 3, 'a five-contact campaign tolerates three before halting')
  assert.equal(lateRefusalLimit(20), 3)
  assert.equal(lateRefusalLimit(300), 30)
  assert.equal(lateRefusalLimit(0), 3)
})

// --- the halts --------------------------------------------------------------

test('a degraded quality rating halts before the next contact', async () => {
  let asked = 0
  const p = ports({ async qualityRating() { return ++asked > 2 ? 'MEDIUM' : 'HIGH' } })
  const out = await runCampaign({ contacts: contacts(10), forecastPermitted: 10, ports: p.ports })
  assert.equal(out.sent, 2)
  assert.equal(out.halted, true)
  assert.match(out.haltedReason!, /quality MEDIUM/)
  assert.match(p.halts[0], /below green/)
})

test('an unreadable rating halts too, rather than proceeding on a null', async () => {
  const p = ports({ async qualityRating() { return null } })
  const out = await runCampaign({ contacts: contacts(3), forecastPermitted: 3, ports: p.ports })
  assert.equal(out.sent, 0)
  assert.equal(out.halted, true)
  assert.match(out.haltedReason!, /unreadable/)
})

test('a rate limit stops the whole walk, because it is about the account', async () => {
  const p = ports({ async send() { return { kind: 'rate_limited' } } })
  const out = await runCampaign({ contacts: contacts(10), forecastPermitted: 10, ports: p.ports })
  assert.equal(out.halted, true)
  assert.match(out.haltedReason!, /rate-limited the account/)
  assert.equal(out.sent, 0)
})

test('an ambiguous send is counted and the walk continues', async () => {
  // The row stays `intended` and reconciliation owns it. The campaign does not
  // stop for one uncertain message.
  let i = 0
  const p = ports({ async send() { return ++i === 1 ? { kind: 'ambiguous' } : { kind: 'sent' } } })
  const out = await runCampaign({ contacts: contacts(4), forecastPermitted: 4, ports: p.ports })
  assert.equal(out.ambiguous, 1)
  assert.equal(out.sent, 3)
  assert.equal(out.halted, false)
})
