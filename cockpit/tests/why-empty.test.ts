import { test } from 'node:test'
import assert from 'node:assert/strict'
import { whyEmpty, type Emptiness } from '../src/lib/why-empty'

/*
 * The five meanings of nothing, and the rule that no two of them may be worded
 * alike. docs/cockpit-build-plan.md §5.
 *
 * The oldest rule in the briefs is that S1 and S2 must not share a sentence,
 * and until now it has been enforced by reading the screens. Here it is
 * mechanical: for ANY subject, the five renderings must be pairwise distinct.
 */

const ESCALATIONS: Record<Emptiness['state'], Emptiness> = {
  resting: { state: 'resting', thing: 'escalations', welcome: true, lastly: 'the last hand-over cleared at 08:41' },
  never: { state: 'never', owner: 'this client', thing: 'a lead', since: 'onboarded 5 September 2026' },
  notChecked: {
    state: 'notChecked',
    thing: 'the queue',
    why: 'the read has not landed since 09:18',
    notTheSameAs: 'an empty queue',
  },
  refused: { state: 'refused', thing: 'reactivation', by: 'Meta has not verified the business' },
  readFailed: { state: 'readFailed', thing: 'the queue', threw: 'statement timeout after 8000ms' },
}

test('the five states are pairwise distinct sentences', () => {
  const rendered = Object.values(ESCALATIONS).map((e) => whyEmpty(e).sentence)
  const unique = new Set(rendered)
  assert.equal(unique.size, rendered.length, `two states share a sentence:\n${rendered.join('\n')}`)
})

test('🔴 two states on the SAME subject are still distinct', () => {
  // The pairwise test above uses each state's natural subject, so a collapse
  // between two states could pass it by having different nouns. This pins the
  // subject and compares the frames themselves — found when a sabotage run
  // collapsed notChecked into resting and test 1 stayed green.
  const same = [
    whyEmpty({ state: 'resting', thing: 'the queue' }).sentence,
    whyEmpty({ state: 'never', owner: 'this client', thing: 'the queue' }).sentence,
    whyEmpty({ state: 'notChecked', thing: 'the queue', why: 'the read has not landed', notTheSameAs: 'an empty queue' }).sentence,
    whyEmpty({ state: 'refused', thing: 'the queue', by: 'Meta has not verified the business' }).sentence,
    whyEmpty({ state: 'readFailed', thing: 'the queue', threw: 'timeout' }).sentence,
  ]
  assert.equal(new Set(same).size, same.length, `two states on one subject share a sentence:\n${same.join('\n')}`)
})

test('🔒 resting and never are different SHAPES, not the same sentence with an adverb', () => {
  const resting = whyEmpty(ESCALATIONS.resting).sentence
  const never = whyEmpty(ESCALATIONS.never).sentence
  assert.notEqual(resting, never)
  // "No escalations" vs "no escalations yet" would pass a distinctness check and
  // still be misread. The shapes must differ, so neither is the other plus a word.
  assert.ok(!never.startsWith(resting.replace(/\.$/, '')), 'never must not be resting with something appended')
  assert.ok(!resting.startsWith(never.replace(/\.$/, '')), 'resting must not be never with something appended')
})

test('🔴 uncertainty and absence are never coloured — grey, not amber and not red', () => {
  assert.equal(whyEmpty(ESCALATIONS.never).tone, 'grey')
  assert.equal(
    whyEmpty(ESCALATIONS.notChecked).tone,
    'grey',
    'amber means a clock is the reason, and "nobody has looked" has no clock in it',
  )
})

test('a refusal is blue, because a rule holding something back is a decision rather than an error', () => {
  assert.equal(whyEmpty(ESCALATIONS.refused).tone, 'held')
})

test('a failed read is red, and never claims the list is empty', () => {
  const r = whyEmpty(ESCALATIONS.readFailed)
  assert.equal(r.tone, 'red')
  assert.match(r.sentence, /not saying there is nothing/)
  assert.ok(r.offersRetry, 'a failed read offers the re-read — the figure is never quietly refreshed instead')
})

test('resting is good news only where it was declared to be', () => {
  assert.equal(whyEmpty({ state: 'resting', thing: 'escalations', welcome: true }).tone, 'through')
  assert.equal(
    whyEmpty({ state: 'resting', thing: 'anomalies', scope: 'in the last 7 days' }).tone,
    'grey',
    'an empty list is not an achievement everywhere — only the queue earns the green',
  )
})

test('🔒 a resting claim carries its scope, because the window IS the claim', () => {
  const withScope = whyEmpty({ state: 'resting', thing: 'anomalies', scope: 'in the last 7 days' }).sentence
  const without = whyEmpty({ state: 'resting', thing: 'anomalies' }).sentence
  assert.match(withScope, /in the last 7 days/)
  assert.notEqual(withScope, without, '"no anomalies" over an hour and over a week are different claims')
})

test('notChecked always names the claim it is NOT, so the two can never be read as one', () => {
  const s = whyEmpty(ESCALATIONS.notChecked).sentence
  assert.match(s, /This is not an empty queue/)
  assert.match(s, /we do not know/)
})

test('the control: a caller cannot render an emptiness without saying which one', () => {
  // Exhaustiveness is the type system's job, so the test that matters is that
  // every state produces a real sentence rather than an empty string — a silent
  // fall-through would render a blank, which is the exact defect.
  for (const [name, e] of Object.entries(ESCALATIONS)) {
    const r = whyEmpty(e)
    assert.ok(r.sentence.length > 20, `${name} rendered almost nothing: "${r.sentence}"`)
    assert.equal(r.state, name)
  }
})
