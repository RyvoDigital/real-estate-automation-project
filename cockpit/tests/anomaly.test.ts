import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  ANOMALY_TYPES,
  anomalyClock,
  groupAnomalies,
  shapeAnomaly,
  stripTrailingPhone,
  type AnomalyEvent,
} from '../src/lib/anomaly'

/*
 * Improvements §4.8.
 *
 * The fixtures are rows the platform ACTUALLY wrote, copied from Supabase
 * after the 16 September proof runs — the sabotage cycle that fired all six
 * invariants, and the error-workflow probe. A test holding its own idea of
 * the shape is lesson 15, so where these disagree with the writers
 * (src/invariants.js and the ShapeError node), the writers are right.
 */

const ev = (over: Partial<AnomalyEvent> & { id: string }): AnomalyEvent => ({
  created_at: '2026-09-16T00:35:07.159982+00:00',
  type: 'invariant.violated',
  severity: 'warning',
  summary: 'x',
  data: {},
  ...over,
})

// The five rows the SABOTAGE-A message produced, verbatim.
const INV1 = ev({
  id: 'e1',
  created_at: '2026-09-15T23:35:07.159982+00:00',
  severity: 'warning',
  summary: 'Invariant 1 violated (time_without_offer): named 15:00; offer holds 9:00 | +351933048230',
  data: {
    invariant: '1',
    slug: 'time_without_offer',
    lead_id: 'lead-a',
    stage: 'pre_send',
    text_sent: 'Olá Zé, já tem uma reunião marcada para terça-feira às 15:00.',
  },
})
const INV2 = ev({
  id: 'e2',
  created_at: '2026-09-15T23:35:07.200000+00:00',
  severity: 'critical',
  summary:
    'Invariant 2 violated (booking_confirmed_without_event): text confirms a booking (ja tem uma reuniao); no event this turn, held booking none | +351933048230',
  data: { invariant: '2', slug: 'booking_confirmed_without_event', lead_id: 'lead-a', stage: 'pre_send' },
})
const INV4 = ev({
  id: 'e4',
  created_at: '2026-09-15T23:35:08.299421+00:00',
  severity: 'critical',
  summary: 'Invariant 4 violated (inbound_without_outbound): nothing_sent via reply | +351933048230',
  data: { invariant: '4', slug: 'inbound_without_outbound', lead_id: 'lead-a', stage: 'run_end' },
})
const RUN_ERR = ev({
  id: 'r1',
  created_at: '2026-09-16T11:15:22.888319+00:00',
  type: 'run.errored',
  severity: 'critical',
  summary:
    'Execution ended in error: ryvo_error_probe at ThrowOnPurpose - error probe: deliberate throw to prove ryvo_error_handler reports it (2026-09-16T11:15:21.909Z) [line 2]',
  data: {
    workflow: 'ryvo_error_probe',
    node: 'ThrowOnPurpose',
    execution_id: '2264',
    execution_url: 'https://n8n.ryvodigital.com/workflow/ryvoErrorProbe01/executions/2264',
  },
})
const CHECK_FAILED = ev({
  id: 'c1',
  type: 'invariant.check_failed',
  severity: 'critical',
  summary: 'Invariant check could not run before the send: boom | +351933048230',
  data: { lead_id: 'lead-a', stage: 'pre_send', error: 'boom' },
})

test('every type the platform writes is one this screen reads', () => {
  // The §4.8 defect in one line: the cockpit read by specific type, and these
  // three were not among them.
  assert.deepEqual([...ANOMALY_TYPES], ['invariant.violated', 'invariant.check_failed', 'run.errored'])
})

test('the trailing phone comes off, and only when it is a phone', () => {
  assert.equal(
    stripTrailingPhone('Invariant 1 violated (time_without_offer): named 15:00; offer holds 9:00 | +351933048230'),
    'Invariant 1 violated (time_without_offer): named 15:00; offer holds 9:00',
  )
  // A summary whose own text contains a pipe keeps it.
  assert.equal(stripTrailingPhone('budget 1.2M | 1.5M recorded'), 'budget 1.2M | 1.5M recorded')
  // A run error has no phone and must survive untouched.
  assert.equal(stripTrailingPhone(RUN_ERR.summary!), RUN_ERR.summary)
})

test('the summary rendered is the sentence the WhatsApp carried', () => {
  // NOT a second formatter: the two would drift and then disagree about the
  // same event. The only difference is the phone.
  const r = shapeAnomaly(INV1)
  assert.equal(r.summary, 'Invariant 1 violated (time_without_offer): named 15:00; offer holds 9:00')
  assert.ok(INV1.summary!.startsWith(r.summary))
})

test('severity drives the row, and an unset severity is not treated as fine', () => {
  assert.equal(shapeAnomaly(INV1).severity, 'warning')
  assert.equal(shapeAnomaly(INV2).severity, 'critical')
  assert.equal(shapeAnomaly(ev({ id: 'x', severity: null })).severity, 'critical')
  assert.equal(shapeAnomaly(ev({ id: 'x', severity: 'info' })).severity, 'critical')
})

test('the evidence a lead would be shown is on the row', () => {
  const r = shapeAnomaly(INV1)
  assert.equal(r.textSent, 'Olá Zé, já tem uma reunião marcada para terça-feira às 15:00.')
  assert.equal(r.leadId, 'lead-a')
  assert.equal(r.stage, 'pre_send')
  // An event without one renders without one, rather than an empty quote.
  assert.equal(shapeAnomaly(INV2).textSent, null)
})

test('a run error carries its execution link and no lead', () => {
  const r = shapeAnomaly(RUN_ERR)
  assert.equal(r.label, 'Run error')
  assert.equal(r.leadId, null)
  assert.equal(r.executionUrl, 'https://n8n.ryvodigital.com/workflow/ryvoErrorProbe01/executions/2264')
  assert.equal(r.kind, 'run.errored:ryvo_error_probe:ThrowOnPurpose')
})

test('a failed check is its own kind, not a violation of invariant "?"', () => {
  const r = shapeAnomaly(CHECK_FAILED)
  assert.equal(r.label, 'Check failed')
  assert.equal(r.invariant, null)
  assert.equal(r.kind, 'invariant.check_failed:pre_send')
})

test('each invariant is its own kind, so five violations are five rows', () => {
  const groups = groupAnomalies([INV4, INV2, INV1].map(shapeAnomaly))
  assert.equal(groups.length, 3)
  assert.deepEqual(
    groups.map((g) => g.latest.invariant),
    ['4', '2', '1'],
  )
  assert.ok(groups.every((g) => g.count === 1))
})

test('THE VOLUME CASE: one fault firing forty times is one row with a count', () => {
  // The failure this list has to survive is not many different anomalies. It
  // is a guard regressing and invariant 1 firing on every single run, burying
  // the second distinct fault below the fold.
  const forty = Array.from({ length: 40 }, (_, i) =>
    shapeAnomaly({ ...INV1, id: `e${i}`, created_at: `2026-09-15T2${i % 4}:00:00.000000+00:00` }),
  )
  const rows = [shapeAnomaly(RUN_ERR), ...forty]
  const groups = groupAnomalies(rows)

  assert.equal(groups.length, 2, 'forty of one fault collapse to one row')
  const inv1 = groups.find((g) => g.latest.invariant === '1')!
  assert.equal(inv1.count, 40)
  assert.equal(inv1.latest.id, 'e0', 'the row shown is the most recent occurrence')
  assert.equal(inv1.oldestAt, '2026-09-15T23:00:00.000000+00:00', 'and it says how far back they go')

  // The rarer fault is still visible, and first, because it is newer.
  assert.equal(groups[0].latest.type, 'run.errored')
})

test('groups are newest-first by their most recent occurrence', () => {
  const groups = groupAnomalies([RUN_ERR, INV4, INV1].map(shapeAnomaly))
  const times = groups.map((g) => Date.parse(g.latest.at))
  assert.deepEqual(times, [...times].sort((a, b) => b - a))
})

test('the clock is absolute and in the operator zone, never relative', () => {
  // A screen left open overnight says "5 minutes ago" for twelve hours.
  const s = anomalyClock('2026-09-15T23:35:07.159982+00:00')
  assert.match(s, /\d{2}:\d{2}/)
  assert.ok(s.includes('16 Sep'), `expected the Lisbon date, got ${s}`)
  assert.ok(!/ago/.test(s))
})
