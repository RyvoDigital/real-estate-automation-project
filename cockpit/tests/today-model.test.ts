import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildToday, type TodayInputs, type TodayQueueRow } from '../src/lib/today/model'
import type { AnomalyGroup, AnomalyRow } from '../src/lib/anomaly'
import { buildExpiries, countedParts, TRACKED, TRACKED_KINDS, type ExpiriesInputs } from '../src/lib/expiries/model'
import { GATES, openGatesOldestFirst, type OpenGate } from '../src/lib/gates'
import type { StillGood } from '../src/lib/publication/still-good'

/* Today, checkpoint 1: every rule of brief §2.1 the page will draw, held here. */

const now = Date.now()
const NOW = new Date(now)
const ex = (over: Partial<ExpiriesInputs> = {}) => buildExpiries({ deployKey: { exp: new Date(now + 365 * 86400000).toISOString(), readAt: new Date(now - 60000).toISOString() }, clients: [], now: NOW, ...over })
const sg = (over: Partial<StillGood> = {}): StillGood => ({ documents: [], registrations: [], exempt: 0, warnWithinDays: 30, staleAfterDays: 90, at: NOW.toISOString(), notAnswered: [], ...over })
const doc = (id: string, daysLeft: number, standing: 'past' | 'soon' | 'good') => ({ listingId: id, reference: `A-${id}`, requirementId: 'pt_energy_certificate', certificateNumber: null, validUntil: new Date(now + daysLeft * 86400000).toISOString().slice(0, 10), daysLeft, standing })
const reg = (n: string, standing: 'not_valid' | 'never_checked' | 'stale' | 'good', days: number | null = null) => ({ requirementId: 'pt_ami_licence', number: n, country: 'PT', region: null, status: 'valid' as never, checkedAt: null, daysSinceChecked: days, standing })
const gate = (id: string, since: string | null, answerable: 'the agency' | 'outside' = 'outside'): OpenGate => ({ id: id as OpenGate['id'], what: `the ${id} gate`, whoHolds: `holder of ${id}`, since, answerable, expected: null, thenHeldBy: null })
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
  expiries: ex(),
  waiting: [],
  now: NOW,
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

test('🔴 group 5 is the plain list: read-only, oldest first, who holds it, whether the agency can end it', () => {
  const w = [gate('old', '2026-08-24'), gate('newer', '2026-09-03', 'the agency'), gate('undated', null)]
  const m = buildToday(inputs({ waiting: w }))
  const g = m.groups[4]
  assert.equal(g.state, 'rows')
  assert.equal(g.count, '3 waiting · all 3 read · the ledger, uncapped')
  assert.match(g.preview, /^Longest: the old gate · holder of old · since 24 Aug 2026 \(\d+ days\)$/)
  assert.deepEqual(g.distribution, [{ label: 'the agency can end', n: 1 }, { label: 'the agency cannot end', n: 2 }])
  assert.deepEqual(m.waiting.map((x) => x.id), ['old', 'newer', 'undated'], 'the ledger order, untouched')
  assert.doesNotMatch(g.preview, /nothing holds these|not designed/)
})

test('🔒 the ledger hands group 5 its gates oldest first, undated last, and never an open one', () => {
  const got = openGatesOldestFirst()
  assert.equal(got.length, GATES.filter((g) => !g.open).length)
  const dated = got.filter((g) => g.since).map((g) => g.since!)
  assert.deepEqual(dated, [...dated].sort(), 'dated gates oldest first')
  const firstUndated = got.findIndex((g) => !g.since)
  assert.ok(firstUndated === -1 || got.slice(firstUndated).every((g) => !g.since), 'no dated gate after an undated one')
  assert.ok(dated.length > 0, 'the control: the real ledger has dated gates, so the order was tested')
})

test('group 5 resting: no open gate is a sentence, with its count', () => {
  const g = buildToday(inputs({ waiting: [] })).groups[4]
  assert.equal(g.state, 'resting')
  assert.equal(g.count, 'nobody waited on · all 0 read · the ledger, uncapped')
})

test('🔒 groups 3 and 4 say they are PARTIAL: what is tracked (clearances included, since 0039), and what is not yet', () => {
  const [g3, g4] = buildToday(inputs()).groups.slice(2, 4)
  for (const g of [g3, g4]) {
    assert.match(g.partial ?? '', /^Partial: this tracks the n8n deploy key, /)
    assert.match(g.partial ?? '', /the clearances the publication gate recorded/)
    assert.match(g.partial ?? '', /Not yet: template approvals/)
    assert.doesNotMatch(g.partial ?? '', /no clearances table/, 'the false sentence Today printed until 22 Sep 2026')
  }
  assert.equal(buildToday(inputs()).groups[0].partial, null)
})

test('group 3: the most overdue first, with its client; the count carries what was checked', () => {
  const e = ex({ clients: [{ id: 'c1', name: 'Marbella Sur', stillGood: sg({ documents: [doc('1', -3, 'past'), doc('2', -40, 'past'), doc('3', 200, 'good')] }) }] })
  const g = buildToday(inputs({ expiries: e })).groups[2]
  assert.equal(g.state, 'rows')
  assert.match(g.preview, /^Longest past: pt energy certificate · A-2 · Marbella Sur · 40 days ago$/)
  assert.equal(g.count, '2 run out · checked the deploy key, 0 of Ryvo’s own, 3 documents, 0 registrations, 0 clearances across 1 client')
})

test('🔒 group 4 previews the head of EACH of its two lists, never one ranked head', () => {
  const e = ex({ clients: [{ id: 'c1', name: 'Casa Atlântica', stillGood: sg({ documents: [doc('9', 12, 'soon'), doc('8', 4, 'soon')], registrations: [reg('777', 'never_checked')] }) }] })
  const g = buildToday(inputs({ expiries: e })).groups[3]
  assert.match(g.preview, /^Soonest: pt energy certificate · A-8 · Casa Atlântica · in 4 days$/)
  assert.equal(g.also, 'Longest unconfirmed: pt ami licence 777 · Casa Atlântica')
  assert.equal(g.count, '2 within 30 days · 1 to confirm · checked the deploy key, 0 of Ryvo’s own, 2 documents, 1 registration, 0 clearances across 1 client')
  const onlyConfirm = buildToday(inputs({ expiries: ex({ clients: [{ id: 'c1', name: 'M', stillGood: sg({ registrations: [reg('1', 'stale', 120)] }) }] }) })).groups[3]
  assert.equal(onlyConfirm.preview, 'Nothing tracked runs out within 30 days.', 'an empty list says so; the other list does not stand in for it')
})

test('🔒 groups 3 and 4 resting say what was checked; a failed read is readFailed, never resting', () => {
  const m = buildToday(inputs())
  assert.equal(m.groups[2].state, 'resting')
  assert.match(m.groups[2].preview, /^Nothing tracked has run out\. Checked the deploy key, 0 of Ryvo’s own, 0 documents, 0 registrations, 0 clearances across 0 clients\.$/)
  const f = buildToday(inputs({ expiries: ex({ deployKey: null, clients: null }) }))
  assert.equal(f.groups[2].state, 'readFailed'); assert.equal(f.groups[3].state, 'readFailed')
  assert.match(f.groups[2].detail ?? '', /deploy key’s expiry could not be read/)
  // One source failing while another read: the groups draw what was read and still name the failure.
  const half = buildToday(inputs({ expiries: ex({ clients: null }) }))
  assert.equal(half.groups[2].state, 'resting')
  assert.match(half.groups[2].detail ?? '', /no client’s documents were checked/)
})

test('outage: three of one system reason in 15 minutes is one fault', () => {
  const rows = [1, 2, 3].map((i) => q(String(i), i, { reasons: ['claude_failed:api_error'] }))
  const m = buildToday(inputs({ queue: { rows, threw: '', cap: 100 } }))
  assert.equal(m.outage.active, true)
  assert.equal(m.outage.count, 3)
})


/*
 * 🔒 THE COUNT AND THE PARTIAL LINE NAME THE SAME SET (22 Sep 2026, Manuel's
 * decision). Group 3 said "checked the deploy key, N documents, N
 * registrations" while the line under it said the screen also tracks the
 * domain, Ryvo's own obligations and the clearances: a complete-looking count
 * of an incomplete set. Both now come from TRACKED_KINDS, and this fails if a
 * tracked thing is ever added without something that counts it.
 */
test('🔒 every tracked thing is counted: the count line and the partial line name the same set', () => {
  const full = { deployKeys: 1, domains: 1, documents: 4, registrations: 2, clients: 3, obligations: 5, clearances: 9, stillGoodClearances: 8 }
  const parts = countedParts(full)
  assert.equal(parts.length, TRACKED.length, 'a tracked thing that nothing counts, or a count for something untracked')
  assert.equal(TRACKED_KINDS.length, TRACKED.length)
  for (const k of TRACKED_KINDS) assert.ok(k.counted(full), `${k.key} is tracked and counts nothing`)
  assert.deepEqual(parts, ['the deploy key', 'the domain', '5 of Ryvo\u2019s own', '4 documents', '2 registrations', '9 clearances'])
  // A thing this run did not read drops out: it never claims a zero it did not measure.
  assert.deepEqual(countedParts({ ...full, deployKeys: 0, domains: 0 }), ['5 of Ryvo\u2019s own', '4 documents', '2 registrations', '9 clearances'])
})

test('🔒 groups 3 and 4 print that same count, beside that same partial line', () => {
  const e = ex({ domain: { expiresOn: '2027-03-18', readAt: new Date(now - 60000).toISOString() }, obligations: [], clearances: [] })
  const m = buildToday(inputs({ expiries: e }))
  for (const n of [3, 4]) {
    const g = m.groups.find((x) => x.n === n)!
    for (const part of countedParts(e.checked)) assert.ok(g.count.includes(part), `group ${n}'s count is missing "${part}"`)
    for (const words of TRACKED) assert.ok((g.partial ?? '').includes(words), `group ${n}'s partial line is missing "${words}"`)
  }
})
