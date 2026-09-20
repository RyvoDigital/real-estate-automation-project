import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyStaleness, showsCollapsed, type RefusedSend, type WorldNow } from '../src/lib/contact/staleness'

/*
 * Brief II §1.4.1. The contact record is the Article 15 answer, so the rule
 * being tested is a legal one as much as a visual one: a refusal is a record of
 * a decision that was taken, it carries the moment it was taken, and it is
 * never overwritten by a better one.
 */

const DECIDED = '2026-09-10T12:00:00Z'
const refusal = (over: Partial<RefusedSend> = {}): RefusedSend => ({
  decidedAt: DECIDED,
  layer: 'policy',
  reason: 'policy_not_confirmed',
  country: 'PT',
  ...over,
})
const world = (over: Partial<WorldNow> = {}): WorldNow => ({ checked: true, ...over })

test('nothing newer: the refusal is current and says nothing extra', () => {
  const s = classifyStaleness(refusal(), world({ advertisingConfirmedAt: '2026-09-01T00:00:00Z' }))
  assert.equal(s.state, 'current')
  assert.equal(showsCollapsed(s), false, 'a current refusal must not carry a flag')
})

test('🔴 the cited cause resolved: it could not be made today, and we say exactly that', () => {
  /*
   * The brief's own example. "Portugal is not confirmed by a lawyer" is true
   * about 22 September and false about a Portugal confirmed on the 20th.
   */
  const s = classifyStaleness(refusal(), world({ advertisingConfirmedAt: '2026-09-15T00:00:00Z' }))
  assert.equal(s.state, 'cause_gone')
  assert.match(s.sentence, /could not be made today/)
  // 🔒 And it says the row stays put. The screen never re-decides.
  assert.match(s.sentence, /left exactly as it was/)
  assert.match(s.sentence, /A new run makes a new row/)
  assert.ok(showsCollapsed(s))
})

test('🔴 an unrelated input moved: we say something changed, NOT what today would say', () => {
  /*
   * The distinction the module exists for. A newer consent event does not tell
   * us the policy refusal would go the other way — and claiming it would is
   * the screen re-deciding the gate with a worse model than the gate has.
   */
  const s = classifyStaleness(refusal(), world({ latestConsentAt: '2026-09-15T00:00:00Z' }))
  assert.equal(s.state, 'moved')
  assert.match(s.sentence, /not saying what today/i)
  assert.doesNotMatch(s.sentence, /could not be made today/)
  assert.ok(showsCollapsed(s))
})

test('an unknown refusal reason falls through to "moved", never to "cause gone"', () => {
  /*
   * 🔒 The safe direction, and the reason the cited-cause table is NAMED rather
   * than pattern-matched. A reason nobody has thought about must not acquire a
   * claim about its own resolution because its spelling resembles one that has.
   */
  const s = classifyStaleness(
    refusal({ reason: 'something_nobody_has_designed_for' }),
    world({ advertisingConfirmedAt: '2026-09-15T00:00:00Z' }),
  )
  assert.equal(s.state, 'moved')
})

test('🔴 a pacing refusal is never stale — the day is refused, not the person', () => {
  /*
   * `lib/send/runner.ts` refuses on pacing BEFORE the gate is asked, and writes
   * layer 'pacing'. It lapses on its own window. Calling it stale would send
   * somebody chasing a confirmation that has nothing to do with it.
   */
  for (const w of [world(), world({ advertisingConfirmedAt: '2026-09-15T00:00:00Z' }), world({ checked: false })]) {
    const s = classifyStaleness(refusal({ layer: 'pacing', reason: 'touched_this_week' }), w)
    assert.equal(s.state, 'lapses', 'a pacing refusal was classified as something else')
    assert.match(s.sentence, /not about this person/)
  }
})

test('🔴 an unread world says NOT CHECKED, never "current"', () => {
  /*
   * The failure that would be invisible: `advertising_policy` cannot be read,
   * every refusal renders unflagged, and the page quietly asserts that nothing
   * has changed. A not-checked wearing a nothing-changed sentence, on the
   * screen that answers a legal request. §0.4-10.
   */
  const s = classifyStaleness(refusal(), world({ checked: false }))
  assert.equal(s.state, 'notChecked')
  assert.match(s.sentence, /we do not know/)
  assert.match(s.sentence, /not that the refusal still stands/)
  assert.ok(showsCollapsed(s), 'an unchecked refusal must be flagged on the collapsed row')

  // And it is not the same sentence as a current one, which has none at all.
  assert.notEqual(s.state, classifyStaleness(refusal(), world()).state)
})

test('the movers are named with dates, so the reader can go and look', () => {
  const s = classifyStaleness(
    refusal(),
    world({ advertisingConfirmedAt: '2026-09-15T00:00:00Z', latestConsentAt: '2026-09-16T00:00:00Z' }),
  )
  assert.equal(s.state, 'cause_gone')
  assert.equal(s.movers.length, 2, 'both newer inputs should be listed')
  assert.ok(s.movers.some((m) => /advertising policy was confirmed on 15 Sep/.test(m)))
  assert.ok(s.movers.some((m) => /consent event was recorded on 16 Sep/.test(m)))
  for (const m of s.movers) assert.match(m, /\d/, `a mover with no date is not checkable: ${m}`)
})

test('an input EXACTLY as old as the decision is not newer', () => {
  // Strictly newer. An input written in the same second as the decision is the
  // decision's own input, not a change to it.
  const s = classifyStaleness(refusal(), world({ advertisingConfirmedAt: DECIDED }))
  assert.equal(s.state, 'current')
})

test('🔴 nothing in the output recomputes the gate', () => {
  /*
   * The structural guarantee, asserted on the shape rather than on prose: the
   * result carries no verdict, no permitted flag, no "today's answer". A caller
   * cannot render what it is not given, which is the same argument as the
   * client landing having no score to print.
   */
  const results = [
    classifyStaleness(refusal(), world()),
    classifyStaleness(refusal(), world({ advertisingConfirmedAt: '2026-09-15T00:00:00Z' })),
    classifyStaleness(refusal({ layer: 'pacing' }), world()),
    classifyStaleness(refusal(), world({ checked: false })),
  ]
  for (const r of results) {
    const keys = Object.keys(r)
    for (const forbidden of ['verdict', 'permitted', 'wouldSend', 'today', 'allowed', 'cleared']) {
      assert.ok(!keys.includes(forbidden), `staleness exposes "${forbidden}" — that is the gate being re-decided`)
    }
  }
})
