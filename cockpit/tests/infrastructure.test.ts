/*
 * /ops/infrastructure (brief §2.4, Q4), moved from /health 22 Sep 2026.
 *
 *   S1 green · S2 never run · S4 🔴 the read failed, distinct from every check
 *   failing · S8 stale after 25 minutes and LOUDER than the checks · S3 🔴
 *   "we could not ask the monitor" ≠ "the monitor says nothing is wrong".
 *
 * Plus the defect that prompted the move: the screen said "Twelve checks" in
 * words while the producer published thirteen. No surface may hardcode a count.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pageFile } from './lib/routes'
import { buildInfrastructure, type InfrastructureInputs } from '../src/lib/infrastructure/model'
import { monitorLine, type MonitorLine } from '../src/lib/infrastructure/monitor'

const NOW = new Date('2026-09-22T18:30:00Z')
const asked: MonitorLine = { asked: true, askedAt: NOW.toISOString(), monitors: [{ name: 'the cockpit', status: 'up', url: 'https://x' }] }
const run = (over: Partial<NonNullable<InfrastructureInputs['run']>> = {}) => ({
  ranAt: new Date(NOW.getTime() - 4 * 60_000).toISOString(), ok: true,
  passed: ['a', 'b', 'c'], failed: [], durationMs: 1500, host: 'ryvo-1', ...over,
})
const i = (over: Partial<InfrastructureInputs> = {}): InfrastructureInputs => ({ run: run(), failure: null, monitor: asked, now: NOW, ...over })

test('S1: a fresh run with everything passing says how many passed, from the row', () => {
  const x = buildInfrastructure(i())
  assert.equal(x.standing, 'green')
  assert.equal(x.checks.total, 3)
  assert.match(x.says, /3 of 3 checks passing/)
  assert.match(x.stamp.relative ?? '', /4 minutes ago/)
  assert.ok(x.stamp.absolute, 'the absolute time is always printed beside the relative one')
})

test('S8 🔒 stale beats green: an old run is "telling you nothing", not "passing"', () => {
  const x = buildInfrastructure(i({ run: run({ ranAt: new Date(NOW.getTime() - 40 * 60_000).toISOString() }) }))
  assert.equal(x.standing, 'stale')
  assert.match(x.says, /No result for 40 minutes/)
  assert.doesNotMatch(x.says, /passing/, 'a stale screen must not report the checks as a current result')
  // The rows are still there to be read; the standing is what changed.
  assert.equal(x.checks.total, 3)
})

test('S2 and S4 🔴 are DIFFERENT facts: never run, and could not be read', () => {
  const never = buildInfrastructure(i({ run: null }))
  assert.equal(never.standing, 'never')
  assert.match(never.says, /never published/)

  const failed = buildInfrastructure(i({ run: null, failure: 'health_runs: timeout' }))
  assert.equal(failed.standing, 'readFailed')
  assert.match(failed.says, /could not be read/)
  assert.match(failed.says, /not the same as the checks failing/)
  assert.match(failed.says, /timeout/)
  assert.notEqual(failed.says, never.says)
})

test('failing checks are counted from the row, and named', () => {
  const x = buildInfrastructure(i({ run: run({ ok: false, passed: ['a'], failed: ['backup FAILED', 'DMARC missing'] }) }))
  assert.equal(x.standing, 'failing')
  assert.deepEqual([x.checks.total, x.checks.failed.length], [3, 2])
  assert.match(x.says, /2 of 3 checks failing/)
})

test('🔴 S3: EVERY not-asked reason says we could not ask, and never reads as "nothing is wrong"', () => {
  const reasons: MonitorLine[] = [
    monitorLine({ ok: false, why: 'No Better Stack token is configured here, so the monitor was not asked.' }, NOW),
    monitorLine({ ok: false, why: 'Better Stack answered HTTP 500.' }, NOW),
    monitorLine({ ok: true, body: { something: 'else' } }, NOW),   // a shape we do not know
    monitorLine({ ok: true, body: null }, NOW),
  ]
  for (const m of reasons) {
    assert.equal(m.asked, false, 'an unrecognised answer is NOT an answer')
    const x = buildInfrastructure(i({ monitor: m }))
    assert.equal(x.monitor.asked, false)
    assert.match(x.monitor.says, /^We could not ask the monitor/)
    assert.doesNotMatch(x.monitor.says, /all up|nothing is wrong|healthy/i)
  }
})

test('🔴 asked, and watching nothing, is not a clean bill either', () => {
  const x = buildInfrastructure(i({ monitor: monitorLine({ ok: true, body: { data: [] } }, NOW) }))
  assert.equal(x.monitor.asked, true)
  assert.equal(x.monitor.asked && x.monitor.allUp, false)
  assert.match(x.monitor.says, /no monitors configured/)
})

test('the monitor line reads only documented fields, and an undocumented status is "unknown"', () => {
  const body = { data: [
    { attributes: { status: 'up', pronounceable_name: 'the cockpit', url: 'https://a' } },
    { attributes: { status: 'down', pronounceable_name: 'n8n', url: 'https://b' } },
    { attributes: { status: 'sideways', url: 'https://c' } },
  ] }
  const m = monitorLine({ ok: true, body }, NOW)
  assert.equal(m.asked, true)
  if (!m.asked) return
  assert.deepEqual(m.monitors.map((x) => x.status), ['up', 'down', 'unknown'])
  assert.equal(m.monitors[2].name, 'https://c', 'a monitor with no pronounceable name falls back to its url')
  const x = buildInfrastructure(i({ monitor: m }))
  assert.equal(x.monitor.asked && x.monitor.allUp, false)
  assert.match(x.monitor.says, /1 down/)
})

test('🔴 NO SURFACE HARDCODES A CHECK COUNT: the number comes from the row', () => {
  /*
   * The defect this test exists for (22 Sep 2026): five surfaces said "Twelve
   * checks" while the producer published thirteen, and tests/probe-health.ts
   * asserted `expected === 12`. A count written as a word or a literal goes out
   * of date in silence, exactly when the thing it counts changes.
   */
  const offenders: string[] = []
  const NUMBER = /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|\d+)\s+checks\b/i
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) { walk(p); continue }
      if (!/\.(tsx?|css)$/.test(p)) continue
      const text = readFileSync(p, 'utf8')
      for (const [n, line] of text.split('\n').entries()) {
        // A template that prints the count — `{checks.total} published` — is the fix, not the defect.
        if (/^\s*[*/]/.test(line)) continue
        if (NUMBER.test(line)) offenders.push(`${p}:${n + 1}: ${line.trim()}`)
      }
    }
  }
  walk(new URL('../src', import.meta.url).pathname)
  assert.deepEqual(offenders, [], `a check count is written into a surface instead of read from the run:\n${offenders.join('\n')}`)
})

test('🔒 a mark per check, the same one every screen uses — and no icon per check TYPE', () => {
  /*
   * Thirteen grey bullets in a stack read by line; a mark per row reads at a
   * glance. The mark is StateMark, so the colour arrives the one sanctioned way
   * and means what it means everywhere else. An icon per check type would
   * decorate the words it sits beside.
   */
  const view = readFileSync(new URL('../src/components/infrastructure/InfrastructureView.tsx', import.meta.url), 'utf8')
  assert.match(view, /<StateMark meaning="red" label="failing" \/>/)
  assert.match(view, /<StateMark meaning="through" label="passing" \/>/)
  const css = readFileSync(new URL('../src/components/infrastructure/infrastructure.module.css', import.meta.url), 'utf8')
  assert.doesNotMatch(css, /var\(--(through|held|clock|red|handled)\b/, 'the screen must not reach for a semantic colour itself')
  // Every check's words stay the producer's: nothing on this screen rewrites them.
  assert.match(view, /\{c\}/)
})

test('🔴 STALE STAYS THE LOUDEST THING ON THE PAGE', () => {
  const css = readFileSync(new URL('../src/components/infrastructure/infrastructure.module.css', import.meta.url), 'utf8')
  const view = readFileSync(new URL('../src/components/infrastructure/InfrastructureView.tsx', import.meta.url), 'utf8')
  // The stamp is the largest type on the screen, and nothing else comes near it.
  const stampSize = /\.stampAbs \{[^}]*font-size: clamp\((\d+)px/.exec(css)
  assert.ok(stampSize && Number(stampSize[1]) >= 28, 'the last-run time must be the biggest thing here')
  assert.match(css, /\.title \{[^}]*font-size: 28px/)
  // The standing's sentence sits INSIDE the stamp block, not floating below it.
  const stamp = view.slice(view.indexOf('<section className={`${styles.stamp}'), view.indexOf('</section>'))
  assert.match(stamp, /styles\.says/, 'the standing must be part of the stamp, or a stale run reads as two quiet things')
})

test('🔒 the screen reads, and offers no re-run: no button, no form, no action import', () => {
  const view = readFileSync(new URL('../src/components/infrastructure/InfrastructureView.tsx', import.meta.url), 'utf8')
  const page = readFileSync(pageFile('/ops/infrastructure'), 'utf8')
  assert.doesNotMatch(view, /<button|<form/, 'a control appeared on a screen whose contract is "read"')
  assert.doesNotMatch(view + page, /use server|Action\b/, 'the infrastructure screen must not write anything')
  assert.match(view, /uptime\.betterstack|BETTER_STACK_LINK/, 'the one link through to Better Stack is the whole of its dashboard here')
  assert.match(page, /await requireOperator\(\)/)
  assert.match(page, /<Frame mode="operator" current="infrastructure"/)
})

test('🔒 /health is kept as a redirect, so the screen is not lost on the day it matters', () => {
  const moved = readFileSync(new URL('../src/app/health/page.tsx', import.meta.url), 'utf8')
  assert.match(moved, /redirect\('\/ops\/infrastructure'\)/)
  assert.doesNotMatch(moved, /health_runs|getHealth/, 'the old screen must be gone, not duplicated')
})
