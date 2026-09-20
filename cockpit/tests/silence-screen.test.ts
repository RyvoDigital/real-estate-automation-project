import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { findSilence, DEFAULT_SILENCE_DAYS } from '../src/lib/matching/silence'
import { STATUS_STALE_AFTER_DAYS } from '../src/lib/publication/still-good'

const PAGE = readFileSync(
  join(import.meta.dirname, '..', 'src', 'app', 'c', '[client]', 'silence', 'page.tsx'),
  'utf-8',
)

/*
 * Brief III §8. The one screen whose entire design is what it does NOT have.
 */

test('🔴 there is no control on the page, and its absence is the design', () => {
  /*
   * "A 'contact them all' control on a screen designed to produce indignation
   * is how an agency's database gets burned in an afternoon."
   *
   * Asserted structurally rather than trusted: no button, no form, no action.
   * A screen whose safety rests on nobody adding a button is a screen with a
   * button in six months.
   */
  const body = PAGE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  assert.ok(!/<button/i.test(body), 'the silence screen has acquired a button')
  assert.ok(!/<form/i.test(body), 'the silence screen has acquired a form')
  assert.ok(!/<input/i.test(body), 'the silence screen has acquired an input')
  assert.ok(!/action=|onClick|formAction/.test(body), 'the silence screen has acquired an action')
  // And no link out of it either: a per-person "contact" is the same thing
  // wearing a different element.
  assert.ok(!/<Link|href=/.test(body), 'the silence screen has acquired a link — a per-person route is a call list')
})

test('🔴 the two side counts are never folded into the headline', () => {
  /*
   * `unknownClock` is a THIRD thing — not silent, not recent. Folding it in
   * would inflate the one number this screen exists to make somebody feel,
   * and inflating that number is the fastest way to make the screen a lie.
   */
  const now = new Date('2026-09-20T12:00:00Z')
  const s = findSilence(
    [
      { leadId: 'a', name: 'A', lastContactAt: '2026-01-01T00:00:00Z', lastMessageAt: null, requirementSources: ['conversation'] },
      { leadId: 'b', name: 'B', lastContactAt: null, lastMessageAt: null, requirementSources: ['conversation'] },
      { leadId: 'c', name: 'C', lastContactAt: '2026-09-19T00:00:00Z', lastMessageAt: null, requirementSources: ['conversation'] },
      { leadId: 'd', name: 'D', lastContactAt: null, lastMessageAt: null, requirementSources: [] },
    ],
    { now },
  )

  assert.equal(s.silent.length, 1, 'only the genuinely silent one is silent')
  assert.equal(s.unknownClock, 1, 'the one with no clock is its own count')
  assert.equal(s.recentlySpoken, 1)
  assert.equal(s.saidNothing, 1, 'somebody who never told us anything is not this screen’s subject')

  // The page computes its denominator from the three that DID tell us
  // something, and never from the total.
  assert.match(PAGE, /const toldUs = s\.silent\.length \+ s\.unknownClock \+ s\.recentlySpoken/)
  assert.ok(!/toldUs.*saidNothing/.test(PAGE), 'saidNothing was folded into the denominator')
})

test('🔴 the rendered list is NOT ordered by how long somebody was ignored', () => {
  /*
   * 🔴 FOUND WHILE BUILDING THE SCREEN, 20 Sep. `findSilence` sorts
   * `silent` by days DESCENDING, and its comment argues for it: "the person
   * left alone longest is the one the agency should look at first".
   *
   * That is exactly the reasoning brief III §8 forbids for this screen:
   * "🔒 No ranking by how silent they are. A list sorted by neglect is a
   * call-list wearing a report's clothes."
   *
   * The library is not wrong to compute it — the old /silence screen uses that
   * order — but this page must not RENDER it, and a caption saying "in no
   * particular order" over a neglect-ranked list would be the page lying about
   * its own most load-bearing property.
   */
  assert.match(
    PAGE,
    /\[\.\.\.s\.silent\]\s*\.sort/,
    'the page renders findSilence’s order, which is ranked by neglect',
  )
  assert.match(PAGE, /localeCompare/, 'the page does not re-order on a neutral key')
  assert.ok(!/b\.days - a\.days/.test(PAGE), 'the page sorts by days, which is the ranking §8 forbids')
})

test('🔴 S1 and S2 are different sentences, which is where that rule was first got right', () => {
  // "Nobody has told us what they want" and "everyone who told us has been
  // spoken to" are opposite findings. This screen is where they would most
  // naturally share a page.
  assert.match(PAGE, /toldUs === 0/, 'the never state is not distinguished')
  assert.match(PAGE, /state: 'never'/)
  assert.match(PAGE, /state: 'resting'/)
  assert.match(PAGE, /this is the state before the work, not a result of it/)
})

test('the threshold is one number defended once, not two', () => {
  /*
   * §8: deliberately the same as STATUS_STALE_AFTER_DAYS — "two different
   * numbers for the same shape of question would each need defending; one
   * needs defending once."
   */
  assert.equal(DEFAULT_SILENCE_DAYS, 90)
  assert.equal(
    DEFAULT_SILENCE_DAYS,
    STATUS_STALE_AFTER_DAYS,
    'the silence threshold and the staleness threshold have drifted apart',
  )
})
