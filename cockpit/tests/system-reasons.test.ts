import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SYSTEM_REASON_HEADS, SYSTEM } from '../src/lib/system-reasons'

/*
 * ONE LIST OF SYSTEM FAILURES, and this is the test that keeps it one.
 *
 * src/system_reasons.js is embedded in n8n's PrepRunEscalated; the cockpit
 * mirrors it (it cannot import from outside cockpit/ in its Vercel build).
 * Until 21 Sep 2026 the two were written separately and DISAGREED on
 * booking_retired, under a comment claiming they matched exactly.
 */
const REPO = join(import.meta.dirname, '..', '..')
const src = readFileSync(join(REPO, 'src', 'system_reasons.js'), 'utf8')
const heads = new Function(src + '\nreturn SYSTEM_REASON_HEADS;')() as string[]

test('the cockpit list is exactly the source list, in order', () => {
  assert.deepEqual([...SYSTEM_REASON_HEADS], heads)
})

test('the cockpit regex is built from that list', () => {
  for (const h of heads) assert.ok(SYSTEM.test(h + ':x'), h)
  assert.equal(SYSTEM.test('booking_retired:cancelled'), false)
  assert.equal(SYSTEM.test('booking_lost_race:slot_taken_since_offer'), false)
})

test('the workflow writes a lost race as booking_lost_race, which is not a system failure', () => {
  const w = JSON.parse(readFileSync(join(REPO, 'workflows', 'ryvoInboundConc01.json'), 'utf8'))
  const code = w.nodes.find((n: { name: string }) => n.name === 'AfterBooking').parameters.jsCode as string
  assert.ok(code.includes("'booking_lost_race:'"), 'AfterBooking does not write booking_lost_race')
  assert.equal(SYSTEM.test('booking_lost_race:x'), false)
})

test('the workflow embeds the source verbatim in PrepRunEscalated', () => {
  const w = JSON.parse(readFileSync(join(REPO, 'workflows', 'ryvoInboundConc01.json'), 'utf8'))
  const node = w.nodes.find((n: { name: string }) => n.name === 'PrepRunEscalated')
  assert.ok(node.parameters.jsCode.includes(src.replace(/\n+$/, '')), 'PrepRunEscalated does not carry src/system_reasons.js verbatim')
})

test('the control: a diverging list is seen', () => {
  const drifted = [...heads, 'booking_retired']
  assert.notDeepEqual([...SYSTEM_REASON_HEADS], drifted)
})
