import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildToday, type TodayInputs, type TodayQueueRow } from '../src/lib/today/model'
import type { AnomalyGroup, AnomalyRow } from '../src/lib/anomaly'

/* Today, checkpoint 1: every rule of brief §2.1 the page will draw, held here. */

const now = Date.now()
const ago = (min: number) => new Date(now - min * 60000).toISOString()
const q = (id: string, minutes: number, over: Partial<TodayQueueRow> = {}): TodayQueueRow => ({
  id, name: `Lead ${id}`, clientId: 'c1', clientName: 'Marbella Sur', at: ago(minutes), minutes,
  reasons: ['needs_human:asked for a person'], handledElsewhere: false, handledAt: null, ...over,
})
const an = (kind: string, minutesAgo: number, severity: 'critical' | 'warning', count = 1): AnomalyGroup => ({
  latest: { id: kind, at: ago(minutesAgo), type: 'invariant.violated', severity, invariant: null, kind, label: `the ${kind} fault`,
    summary: 's', textSent: null, leadId: null, clientId: 'c1', stage: null, executionUrl: null } as AnomalyRow,
  count, oldestAt: ago(minutesAgo + 60),
})
const inputs = (over: Partial<TodayInputs> = {}): TodayInputs => ({
  queue: { rows: [], threw: '', cap: 100 },
  anomalies: { groups: [], total: 0, capped: false, threw: '', windowDays: 7 },
  clientsWithAutomation: 1,
  openGates: 6,
  ...over,
})

test('🔒 five groups, always in the fixed order, whatever the data', () => {
  const quiet = buildToday(inputs())
  const busy = buildToday(inputs({ queue: { rows: [q('a', 500), q('b', 5)], threw: '', cap: 100 }, anomalies: { groups: [an('x', 1, 'critical', 40)], total: 40, capped: false, threw: '', windowDays: 7 } }))
  for (const m of [quiet, busy]) {
    assert.deepEqual(m.groups.map((g) => g.n), [1, 2, 3, 4, 5])
    assert.deepEqual(m.groups.map((g) => g.name), ['Waiting on a human', 'Something went wrong', 'Something has run out', 'Something is about to run out', 'Waiting on someone else'])
  }
})

test('🔒 there is no cross-group ranking anywhere in the model (no score, no sort of groups)', () => {
  // The CODE, comments stripped: the file's own prose explains why there is no score.
  const code = readFileSync(join(import.meta.dirname, '..', 'src', 'lib', 'today', 'model.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  assert.doesNotMatch(code, /\.sort\(/, 'the model sorts something; within a group the read orders, across groups nothing may')
  assert.doesNotMatch(code, /priority|score|urgency|urgent/i)
})

test('🔒 every group opens collapsed', () => {
  const m = buildToday(inputs({ queue: { rows: [q('a', 600)], threw: '', cap: 100 } }))
  assert.ok(m.groups.every((g) => g.open === false))
})

test('group 1 preview: the LONGEST waiting, computed, not the first row read', () => {
  const rows = [q('short', 12, { clientName: 'Casa Atlântica', reasons: ['needs_human:x'] }), q('long', 400, { clientName: 'Marbella Sur', reasons: ['high_value:3200000>=1500000'] })]
  const g = buildToday(inputs({ queue: { rows, threw: '', cap: 100 } })).groups[0]
  assert.equal(g.state, 'rows')
  assert.match(g.preview, /^Longest: .* · Marbella Sur$/)
})

test('group 1 count carries its denominator, and the handled-elsewhere tray apart', () => {
  const rows = [q('a', 10), q('b', 100), q('c', 300, { handledElsewhere: true, handledAt: ago(5) })]
  const g = buildToday(inputs({ queue: { rows, threw: '', cap: 100 } })).groups[0]
  assert.equal(g.count, '2 waiting · 1 handled elsewhere · 3 read · cap 100')
})

test('group 1 capped: "100+", never a silent 100', () => {
  const rows = Array.from({ length: 100 }, (_, i) => q(String(i), 5))
  const g = buildToday(inputs({ queue: { rows, threw: '', cap: 100 } })).groups[0]
  assert.match(g.count, /^100\+ waiting · 100\+ read · cap 100$/)
})

test('group 1 distribution: the tiers of the WAITING rows, breach first, zeros left out', () => {
  const rows = [q('a', 10), q('b', 20), q('c', 45), q('d', 300), q('e', 400, { handledElsewhere: true, handledAt: ago(1) })]
  const g = buildToday(inputs({ queue: { rows, threw: '', cap: 100 } })).groups[0]
  assert.deepEqual(g.distribution, [{ label: 'breach', n: 1 }, { label: 'ageing', n: 1 }, { label: 'settled', n: 2 }])
})

test('group 1 resting: nobody waiting, still with its denominator', () => {
  const g = buildToday(inputs({ queue: { rows: [q('h', 50, { handledElsewhere: true, handledAt: ago(2) })], threw: '', cap: 100 } })).groups[0]
  assert.equal(g.state, 'resting')
  assert.equal(g.count, 'nobody waiting · 1 handled elsewhere · 1 read · cap 100')
})

test('🔒 a read that failed says so in ITS group, and the other four still render', () => {
  const m = buildToday(inputs({ queue: { rows: null, threw: 'leads query failed: timeout', cap: 100 } }))
  assert.equal(m.groups[0].state, 'readFailed')
  assert.match(m.groups[0].preview, /could not be read, so this page is not saying there is nothing/)
  assert.equal(m.groups[0].detail, 'leads query failed: timeout', 'the thrown sentence, as thrown')
  assert.equal(m.groups.length, 5)
  assert.equal(m.groups[1].state, 'resting')
  const m2 = buildToday(inputs({ anomalies: { groups: null, total: 0, capped: false, threw: 'events: 503', windowDays: 7 } }))
  assert.equal(m2.groups[1].state, 'readFailed')
  assert.equal(m2.groups[0].state, 'resting')
})

test('group 2 preview: the MOST RECENT fault by its own clock; count with its window; capped as "+"', () => {
  const groups = [an('old', 3000, 'critical', 30), an('recent', 2, 'warning', 3), an('mid', 600, 'critical', 7)]
  const g = buildToday(inputs({ anomalies: { groups, total: 500, capped: true, threw: '', windowDays: 7 } })).groups[1]
  assert.match(g.preview, /^Newest: the recent fault · 3× in the last 7 days$/)
  assert.equal(g.count, '3 faults · 500+ occurrences in the last 7 days')
  assert.deepEqual(g.distribution, [{ label: 'critical', n: 2 }, { label: 'warning', n: 1 }])
})

test('🔒 a preview never reaches across groups: group 2 is not previewed by a longer escalation', () => {
  const m = buildToday(inputs({ queue: { rows: [q('a', 900)], threw: '', cap: 100 }, anomalies: { groups: [an('x', 3, 'warning')], total: 1, capped: false, threw: '', windowDays: 7 } }))
  assert.match(m.groups[1].preview, /the x fault/)
  assert.doesNotMatch(m.groups[1].preview, /Marbella|Longest/)
})

test('S2: no client has any automation on is its own sentence, not a resting group', () => {
  assert.match(buildToday(inputs({ clientsWithAutomation: 0 })).never ?? '', /No client has any automation/)
  assert.equal(buildToday(inputs({ clientsWithAutomation: 2 })).never, null)
  assert.equal(buildToday(inputs({ clientsWithAutomation: null })).never, null, 'a failed read is not S2')
})

test('🔴 group 5 no longer claims "nothing holds these": the ledger does; it is NOT DESIGNED yet', () => {
  const g = buildToday(inputs({ openGates: 6 })).groups[4]
  assert.equal(g.state, 'notDesigned')
  assert.match(g.count, /6 open gates in the ledger · not designed yet/)
  assert.doesNotMatch(g.preview, /nothing holds these/)
})

test('groups 3 and 4 say what is missing and what ends the gap', () => {
  const [g3, g4] = buildToday(inputs()).groups.slice(2, 4)
  assert.equal(g3.state, 'notBuilt'); assert.equal(g4.state, 'notBuilt')
  assert.match(g3.preview, /no clearances table and nothing writes one/)
  assert.match(g3.preview, /It needs a clearances table and a writer in the gate\./)
  assert.match(g4.preview, /the same missing input as group 3/)
})

test('outage: three of one system reason in 15 minutes is one fault', () => {
  const rows = [1, 2, 3].map((i) => q(String(i), i, { reasons: ['claude_failed:api_error'] }))
  const m = buildToday(inputs({ queue: { rows, threw: '', cap: 100 } }))
  assert.equal(m.outage.active, true)
  assert.equal(m.outage.count, 3)
})
