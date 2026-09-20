import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { automationState, AUTOMATION_WORD, type AutomationFacts } from '../src/lib/automation-state'

/*
 * One state machine, one vocabulary. docs/cockpit-shared-claims.md S6.
 *
 * The three distinctions below are not stylistic. Each is a pair that looks
 * alike on a screen and means the opposite thing to the person acting on it.
 */

const F = (o: Partial<AutomationFacts> = {}): AutomationFacts => ({
  enabled: true,
  everRan: true,
  missing: [],
  heldBy: null,
  ...o,
})

const META = { what: 'Meta has not verified the business', href: '/waiting' }

test('🔒 held and off are never the same word — one is the world, the other is a decision', () => {
  const held = automationState(F({ heldBy: META }))
  const off = automationState(F({ enabled: false, switchedOffBy: { who: 'M. Vale', when: '2026-09-18' } }))
  assert.equal(held.state, 'held')
  assert.equal(off.state, 'off')
  assert.notEqual(held.word, off.word)
  // You clear a hold; you reverse a decision. The screen must not offer the
  // wrong one, which starts with not confusing the two words.
  assert.equal(held.tone, 'held', 'a rule holding something back is blue')
  assert.equal(off.tone, 'grey', 'a decision to stop is an absence of operation, and absence is not coloured')
})

test('🔒 never run and running are never the same word — absence of history is not a quiet Tuesday', () => {
  const never = automationState(F({ everRan: false }))
  const running = automationState(F({ everRan: true }))
  assert.equal(never.state, 'never_run')
  assert.equal(running.state, 'running')
  assert.notEqual(never.word, running.word)
})

test('🔒 not set up and held are never the same word — our omission is not the gate working', () => {
  const notSetUp = automationState(F({ missing: ['a review destination'] }))
  const held = automationState(F({ heldBy: META }))
  assert.equal(notSetUp.state, 'not_set_up')
  assert.equal(held.state, 'held')
  assert.notEqual(notSetUp.word, held.word)
  assert.deepEqual(notSetUp.missing, ['a review destination'], 'and it names what is missing')
})

test('🔴 held ALWAYS says what holds it, and where to go', () => {
  const held = automationState(F({ heldBy: META }))
  assert.ok(held.heldBy, 'the held state without a reason would be a dead end')
  assert.equal(held.heldBy?.what, META.what)
  assert.ok(held.heldBy?.href, 'and somewhere to act on it')
  // The others never claim to be held.
  for (const s of [F({ enabled: false }), F({ everRan: false }), F({ missing: ['a calendar'] })]) {
    assert.equal(automationState(s).heldBy, null)
  }
})

test('precedence: not set up beats off, because switching it on would change nothing', () => {
  const s = automationState(F({ enabled: false, missing: ['a calendar id'] }))
  assert.equal(s.state, 'not_set_up')
})

test('precedence: off beats held, because the gate is moot while nobody has asked it to run', () => {
  const s = automationState(F({ enabled: false, heldBy: META }))
  assert.equal(s.state, 'off')
})

test('🔒 but a state that is off AND would be held carries both, so no screen recomputes', () => {
  const s = automationState(F({ enabled: false, heldBy: META }))
  assert.equal(s.state, 'off')
  assert.equal(s.heldBy, null, 'it is not held — nobody asked the gate anything')
  assert.deepEqual(s.alsoHeldBy, META, 'and the screen can still say the gate would refuse anyway')
})

test('the five words are exactly the five, and none of them is a consequence', () => {
  assert.deepEqual(Object.values(AUTOMATION_WORD).sort(), [
    'held',
    'never run',
    'not set up',
    'off',
    'running',
  ])
})

// ── the retired vocabulary ──────────────────────────────────────────────────

const SRC = new URL('../src/', import.meta.url).pathname

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(tsx|ts|css)$/.test(name)) out.push(full)
  }
  return out
}

/*
 * "Cannot send" describes a consequence rather than a state, and it is what
 * `held` already means. Retiring a phrase without a check means it comes back
 * the first time somebody writes the obvious sentence.
 */
const RETIRED = /\bcannot send\b/i

/**
 * 🔒 A DETECTOR MUST MATCH WHAT SHIPS, NOT WHAT IS WRITTEN ABOUT IT.
 *
 * The first version of this check flagged lib/gate.ts and
 * lib/send/provider-reader.ts, both of which say "cannot send" in a COMMENT
 * about what the file is able to do — "THIS FILE CANNOT SEND, AND NOT BY
 * ACCIDENT". That is prose about the code, and it is correct prose.
 *
 * This is the second false positive of the same afternoon: the colour detector
 * refused to match the word "red" in prose for the same reason, and the counts
 * detector was narrowed to the frame boundary for the same reason. A detector
 * with false positives gets suppressed rather than obeyed, and a suppressed
 * detector is worse than none because it reads as coverage.
 */
export function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ')
}

test('🔴 "cannot send" does not come back', () => {
  const offenders: string[] = []
  for (const file of walk(SRC)) {
    const text = withoutComments(readFileSync(file, 'utf8'))
    if (RETIRED.test(text)) {
      offenders.push(relative(SRC, file))
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `"cannot send" is a consequence, not a state — say held, and name what holds it:\n${offenders.join('\n')}`,
  )
})

test('the control: the retired-phrase detector finds what ships and ignores what is written about it', () => {
  assert.ok(RETIRED.test('05 · Review requests — Cannot send — the same wait on Meta as 02.'))
  assert.equal(RETIRED.test('held by its gate'), false)
  // The two shapes that made this check wrong the first time:
  assert.equal(RETIRED.test(withoutComments('/* THIS FILE CANNOT SEND, AND NOT BY ACCIDENT */')), false)
  assert.equal(RETIRED.test(withoutComments('// it cannot send marketing at all')), false)
  // And a real relapse still fails, even with a comment in the same file:
  const relapse = withoutComments('/* a comment */\nconst label = "Cannot send"')
  assert.ok(RETIRED.test(relapse), 'stripping comments must not strip the code between them')
})
