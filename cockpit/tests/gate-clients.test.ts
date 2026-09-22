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

test('getQueue: operator-wide excludes the hidden clients; one client asked for by id does not', () => {
  /*
   * 🔁 22 Sep 2026: the set widened from the deploy gate's client to everyone
   * who is not this business — rehearsals too (lib/hidden-clients.ts). The
   * PROPERTY is unchanged and is what this asserts: operator-wide leaves them
   * out, one client asked for by id gets its own work whatever it is.
   */
  const b = body('getQueue')
  assert.match(b, /if \(clientId\) q = q\.eq\('client_id', clientId\)\s*\n\s*else q = withoutGateClients\(q, \(await hiddenClients\(includeRehearsals\)\)\.ids\)/)
})

test('getOpenCount applies the same exclusion as getQueue (the badge and the queue agree)', () => {
  const b = body('getOpenCount')
  assert.match(b, /await hiddenClients\(includeRehearsals\)/)
  assert.match(b, /withoutGateClients\(/)
  // 🔒 The badge takes the same answer the screen did, or the two disagree by every rehearsal lead.
  const counts = readFileSync(join(SRC, 'counts.ts'), 'utf8')
  assert.match(counts, /getQueue\(QUEUE_LIMIT, clientId, includeRehearsals\)/)
})

test('getLeads: the list and its count exclude the gate, unless a client is chosen in the filter', () => {
  const b = body('getLeads')
  assert.match(b, /const gate = f\.client && UUID\.test\(f\.client\) \? \[\] : await gateClientIds\(\)/)
  // inside applyFilters, which both the count and the rows go through
  assert.match(b, /applyFilters[\s\S]*q2 = withoutGateClients\(q2, gate\)/)
})

test('anomalies: operator-wide excludes the hidden clients and keeps the unattributed; per lead or per client does not', () => {
  // 🔒 A fault of a rehearsal's is a fault in a rehearsal. One that names NO
  // client is kept, because it may be about anybody.
  const b = body('readAnomalies')
  assert.match(b, /if \(!filter\?\.leadId && !filter\?\.clientId\) \{/)
  assert.match(b, /withoutGateClientsKeepingUnattributed\(q, \(await hiddenClients\(filter\?\.includeRehearsals \?\? false\)\)\.ids\)/)
})

test('every operator count comes through getQueue (counts.ts), so it inherits the exclusion', () => {
  const counts = readFileSync(join(SRC, 'counts.ts'), 'utf8')
  assert.match(counts, /const rows = await getQueue\(QUEUE_LIMIT, clientId, includeRehearsals\)/)
})

/*
 * 🔴 THE WIDER RULE (22 Sep 2026): a rehearsal is real work on real rows and is
 * not this business's work, so it is left out of the operator-wide screens —
 * BY THE FLAG, never by name — with a control to include it and a line saying
 * how many are hidden.
 */
test('🔴 rehearsals are hidden by the flag, and an unanswered flag hides NOBODY', () => {
  const hidden = readFileSync(join(SRC, 'hidden-clients.ts'), 'utf8')
  assert.match(hidden, /select\('id, rehearsal'\)/)
  assert.match(hidden, /c\.rehearsal === true/, 'hidden only when the answer is true')
  assert.doesNotMatch(hidden, /rehearsal !== false/, 'a null answer must not hide a real agency’s waiting lead')
  // Never by name — read from the CODE: this file's own comment quotes "ZZ GATE"
  // as the example of what must not be done, which is prose, not a filter.
  const code = hidden.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  assert.doesNotMatch(code, /\.eq\('name'|ZZ|GATE/)
})

test('🔴 a failed read of the flags hides nobody, and says so', () => {
  const hidden = readFileSync(join(SRC, 'hidden-clients.ts'), 'utf8')
  assert.match(hidden, /failed: true/)
  assert.match(hidden, /if \(h\.failed\) return/, 'the line must say the flags could not be read')
  assert.match(hidden, /may include rehearsals/)
})

test('🔒 the screens say how many are hidden, and offer to include them', () => {
  const today = readFileSync(join(SRC, '..', 'components', 'today', 'TodayView.tsx'), 'utf8')
  const expiries = readFileSync(join(SRC, '..', 'components', 'expiries', 'ExpiriesView.tsx'), 'utf8')
  // One line per cross-client group: 1, 2, 3 and 4.
  assert.equal([...today.matchAll(/<Hidden model=\{model\} \/>/g)].length, 4)
  assert.match(today, /ensaios=1/)
  assert.match(expiries, /hiddenLine\(hidden\)/)
  assert.match(expiries, /ensaios=1/)
})
