import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { DEFAULT_SILENCE_DAYS, findSilence, type SilenceInput } from '../src/lib/matching/silence'
import { SILENCE, FORBIDDEN_ON_SCREEN } from '../src/lib/matching/screen-copy'

/**
 * "Fourteen people told you what they wanted and nobody has spoken to them in
 * ninety days."
 *
 * The force is in the CONJUNCTION, so the tests are about the conjunction: who
 * is excluded and why, and what is counted separately rather than folded into a
 * number that will be quoted at an agency.
 */

const NOW = new Date('2026-09-18T12:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString()

const l = (over: Partial<SilenceInput> = {}): SilenceInput => ({
  leadId: Math.random().toString(36).slice(2),
  name: 'Maria Santos',
  lastContactAt: null,
  lastMessageAt: null,
  requirementSources: ['conversation'],
  ...over,
})

test('somebody who said something and was then left alone is the whole subject', () => {
  const s = findSilence([l({ leadId: 'x', lastContactAt: daysAgo(150) })], { now: NOW })
  assert.deepEqual(s.silent.map((x) => x.leadId), ['x'])
  assert.equal(s.silent[0].days, 150)
})

test('a dormant contact who never said anything is NOT in the list', () => {
  // This is the whole difference from what a CRM already shows. A list of
  // dormant contacts is a list nobody reads; a list of people who SAID
  // something and were left alone is an accusation.
  const s = findSilence([l({ requirementSources: [], lastContactAt: daysAgo(400) })], { now: NOW })
  assert.deepEqual(s.silent, [])
  assert.equal(s.saidNothing, 1)
})

test('⚠️ a spreadsheet field is not somebody speaking, and nor is an agent’s note', () => {
  // `field` is the agency's record of a person, not the person. `agent` is the
  // agency talking to itself — counting it would let an agency generate its own
  // accusations by writing notes.
  for (const source of ['field', 'agent']) {
    const s = findSilence([l({ requirementSources: [source], lastContactAt: daysAgo(400) })], { now: NOW })
    assert.deepEqual(s.silent, [], `${source} must not count as having spoken`)
    assert.equal(s.saidNothing, 1)
  }
  // And the two that do count.
  for (const source of ['conversation', 'note']) {
    const s = findSilence([l({ requirementSources: [source], lastContactAt: daysAgo(400) })], { now: NOW })
    assert.equal(s.silent.length, 1, `${source} is the person speaking`)
  }
})

test('the most recent clock wins, whichever it is', () => {
  // Using one alone is wrong in BOTH directions: a Concierge lead has no
  // imported date and would look eternally silent; an imported contact who
  // wrote in last week would look silent because the spreadsheet says 2022.
  const recentMessage = findSilence(
    [l({ lastContactAt: daysAgo(400), lastMessageAt: daysAgo(3) })], { now: NOW },
  )
  assert.deepEqual(recentMessage.silent, [], 'they wrote to us three days ago')
  assert.equal(recentMessage.recentlySpoken, 1)

  const onlyMessage = findSilence([l({ lastMessageAt: daysAgo(200) })], { now: NOW })
  assert.equal(onlyMessage.silent.length, 1, 'a Concierge lead has no imported date')
  assert.equal(onlyMessage.silent[0].days, 200)
})

test('⚠️ "we have no idea when" is counted separately, never folded in', () => {
  // A number that quietly includes the unknowns is the kind that gets quoted at
  // an agency and then cannot be defended.
  const s = findSilence([l({ leadId: 'nc' })], { now: NOW })
  assert.deepEqual(s.silent, [])
  assert.equal(s.unknownClock, 1)
})

test('a clock in the future is unknown, not "spoken to recently"', () => {
  // A bad date must fail toward being VISIBLE. Reading it as recent contact
  // would hide somebody, which is the direction that cannot be noticed.
  const s = findSilence([l({ lastContactAt: new Date(NOW.getTime() + 86_400_000).toISOString() })], { now: NOW })
  assert.deepEqual(s.silent, [])
  assert.equal(s.unknownClock, 1)
  assert.equal(s.recentlySpoken, 0)
})

test('the longest silence is first, and ties are total', () => {
  const s = findSilence([
    l({ leadId: 'b', lastContactAt: daysAgo(100) }),
    l({ leadId: 'z', lastContactAt: daysAgo(300) }),
    l({ leadId: 'a', lastContactAt: daysAgo(100) }),
  ], { now: NOW })
  assert.deepEqual(s.silent.map((x) => x.leadId), ['z', 'a', 'b'],
    'the person left longest is the strongest case and belongs at the top')
})

test('the threshold is the specification’s ninety days, and is overridable', () => {
  assert.equal(DEFAULT_SILENCE_DAYS, 90)
  const rows = [l({ lastContactAt: daysAgo(60) })]
  assert.equal(findSilence(rows, { now: NOW }).silent.length, 0)
  assert.equal(findSilence(rows, { now: NOW, thresholdDays: 30 }).silent.length, 1)
  assert.equal(findSilence(rows, { now: NOW }).thresholdDays, 90, 'the figure travels with the answer')
})

test('an empty database says nothing rather than zero', () => {
  const s = findSilence([], { now: NOW })
  assert.deepEqual(s.silent, [])
  assert.equal(s.saidNothing + s.unknownClock + s.recentlySpoken, 0)
})

// --- the words --------------------------------------------------------------

test('the headline is the argument, and a count of one reads as one', () => {
  assert.match(SILENCE.headlineOne(90), /Uma pessoa/)
  assert.doesNotMatch(SILENCE.headlineOne(90), /pessoas/)
  assert.match(SILENCE.headlineMany(14, 90), /14 pessoas/)
  // The conjunction must survive in the copy: "told us" AND "nobody spoke".
  for (const s of [SILENCE.headlineOne(90), SILENCE.headlineMany(14, 90)]) {
    assert.match(s, /disse(ram)?-nos o que procurava(m)?/)
    assert.match(s, /ninguém fala/)
  }
  assert.doesNotMatch(SILENCE.unknownClockOne, /pessoas/)
  assert.doesNotMatch(SILENCE.recentlyOne, /pessoas/)
})

test('no internal vocabulary reaches the screen', () => {
  const strings: string[] = []
  const walk = (v: unknown) => {
    if (typeof v === 'string') strings.push(v)
    else if (typeof v === 'function') strings.push(String((v as (...a: unknown[]) => string)(2, 90)))
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(SILENCE)
  assert.ok(strings.length > 12, 'too little copy for the guard to mean anything')
  const offences = strings.flatMap((s) =>
    FORBIDDEN_ON_SCREEN.filter((t) => new RegExp(`\\b${t}\\b`, 'i').test(s)).map((t) => `"${t}" in ${s}`))
  assert.deepEqual(offences, [])
})

test('the screen surfaces who was left alone, and has no way to contact anybody', () => {
  /*
   * 🔁 22 Sep 2026. /silence/[clientId] was RETIRED; this guards its
   * replacement, /c/<client>/silence.
   *
   * 🔒 WHAT SURVIVED THE MOVE, and it is the half that matters: reaching these
   * people is consent-gated and paced (§7, §6.2). A "contact them all" control
   * on a screen designed to produce indignation is how an agency's database
   * gets burned in an afternoon.
   *
   * 🔴 WHAT DID NOT, said plainly rather than quietly dropped: the old screen
   * also asserted NO PROSE IN THE PAGE, because its sentences were the
   * agency's, in Portuguese, and belonged in screen-copy.ts where the
   * vocabulary guard above can see them. The rebuilt screen is operator-facing
   * and English, and writes its sentences inline like every other /c/ screen.
   * The vocabulary guard still covers the copy module; this file no longer
   * claims the page holds no prose, because it does.
   */
  const src = readFileSync(new URL('../src/app/c/[client]/silence/page.tsx', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert.doesNotMatch(src, /<form|<button|action=/, 'this screen surfaces; it does not act')
  // And it is still the same read behind it, not a second one that agrees today.
  assert.match(src, /readSilence\(/)
})

test('⚠️ the silence path does not read consent, the ledger or the suppression list', () => {
  for (const f of ['silence.ts', 'silence-read.ts']) {
    const src = readFileSync(new URL(`../src/lib/matching/${f}`, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    assert.doesNotMatch(src, /@\/lib\/gate|@\/lib\/suppression|decideGate|consent_by_contact|consent_events/, f)
  }
})
