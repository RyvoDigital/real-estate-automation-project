import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { withoutGateClients, withoutGateClientsKeepingUnattributed } from '../src/lib/gate-clients'

/*
 * The deploy gate's test clients stay out of every operator-wide list and count
 * (22 Sep 2026: 78 gate leads in the Queue, and the operator handed back the
 * wrong lead). Identified by the gate_only MARKER, never by name; a read
 * narrowed to one client is the explicit route and is never filtered.
 */

const SRC = join(import.meta.dirname, '..', 'src', 'lib')
const data = readFileSync(join(SRC, 'data.ts'), 'utf8')
const gateSrc = readFileSync(join(SRC, 'gate-clients.ts'), 'utf8')

/** A recording stand-in for the Supabase builder: every call returns itself. */
function recorder() {
  const calls: [string, ...string[]][] = []
  const q = {
    not: (...a: string[]) => { calls.push(['not', ...a]); return q },
    or: (...a: string[]) => { calls.push(['or', ...a]); return q },
  }
  return { q, calls }
}

/** The source of one top-level function in data.ts. */
function body(name: string): string {
  const i = data.search(new RegExp(`(export )?async function ${name}\\b`))
  assert.ok(i >= 0, `${name} not found in data.ts`)
  const next = data.slice(i + 10).search(/\n(export )?(async )?function /)
  return next < 0 ? data.slice(i) : data.slice(i, i + 10 + next)
}

test('the gate clients are found by the gate_only marker, never by name', () => {
  assert.match(gateSrc, /config->>gate_only', 'true'/)
  for (const f of ['data.ts', 'gate-clients.ts', 'counts.ts']) {
    assert.doesNotMatch(readFileSync(join(SRC, f), 'utf8'), /ZZ GATE|deploy gate — /, `${f} names the gate client`)
  }
})

test('leads: the gate clients are dropped with NOT IN', () => {
  const { q, calls } = recorder()
  withoutGateClients(q, ['g1', 'g2'])
  assert.deepEqual(calls, [['not', 'client_id', 'in', '(g1,g2)']])
})

test('events: the gate clients are dropped and an anomaly with no client is KEPT', () => {
  const { q, calls } = recorder()
  withoutGateClientsKeepingUnattributed(q, ['g1'])
  assert.deepEqual(calls, [['or', 'client_id.is.null,client_id.not.in.(g1)']])
})

test('no gate client known (or the marker read failed): nothing is filtered, so nothing real is hidden', () => {
  const a = recorder(); withoutGateClients(a.q, []); assert.deepEqual(a.calls, [])
  const b = recorder(); withoutGateClientsKeepingUnattributed(b.q, []); assert.deepEqual(b.calls, [])
  assert.match(gateSrc, /if \(error\) return \[\]/)
})

test('getQueue: operator-wide excludes the gate; one client asked for by id does not', () => {
  const b = body('getQueue')
  assert.match(b, /if \(clientId\) q = q\.eq\('client_id', clientId\)\s*\n\s*else q = withoutGateClients\(q, await gateClientIds\(\)\)/)
})

test('getOpenCount applies the same exclusion as getQueue (the badge and the queue agree)', () => {
  const b = body('getOpenCount')
  assert.match(b, /await gateClientIds\(\)/)
  assert.match(b, /withoutGateClients\(/)
})

test('getLeads: the list and its count exclude the gate, unless a client is chosen in the filter', () => {
  const b = body('getLeads')
  assert.match(b, /const gate = f\.client && UUID\.test\(f\.client\) \? \[\] : await gateClientIds\(\)/)
  // inside applyFilters, which both the count and the rows go through
  assert.match(b, /applyFilters[\s\S]*q2 = withoutGateClients\(q2, gate\)/)
})

test('anomalies: operator-wide excludes the gate and keeps the unattributed; per lead or per client does not', () => {
  const b = body('readAnomalies')
  assert.match(b, /if \(!filter\?\.leadId && !filter\?\.clientId\) q = withoutGateClientsKeepingUnattributed\(q, await gateClientIds\(\)\)/)
})

test('every operator count comes through getQueue (counts.ts), so it inherits the exclusion', () => {
  const counts = readFileSync(join(SRC, 'counts.ts'), 'utf8')
  assert.match(counts, /const rows = await getQueue\(QUEUE_LIMIT, clientId\)/)
})
