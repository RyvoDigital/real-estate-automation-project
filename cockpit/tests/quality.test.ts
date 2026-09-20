/*
 * ⚠️ THIS TESTS LOGIC NO CALLER REACHES.
 *
 * checkBeforeBatch has no caller anywhere outside its own module and this
 * directory — see tests/reachability.test.ts, which is the ledger. Everything
 * below is true about the logic and says nothing about whether it runs.
 *
 * The tests are not wrong and they are not wasted: the gate was built before
 * its caller, deliberately, and this is what proves it correct so that wiring
 * it later is a small act rather than a leap. But the COUNT must not read as
 * coverage of a working system, which is why this banner is here and not only
 * in the ledger.
 *
 * Built and unwired — not built and reachable. Delete this banner when it is.
 */
/*
 * The quality-rating halt.
 *
 * The asymmetry every case here rests on: the cost of halting early is a
 * delayed campaign, and the cost of halting late is the number the Concierge
 * runs on. So every ambiguous input halts.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  assessQuality, checkBeforeBatch, mayResumeHaltedRun, type SenderReader,
} from '../src/lib/send/quality'

test('a good rating proceeds, in both vocabularies', () => {
  for (const r of ['HIGH', 'GREEN', 'high', ' green ']) {
    assert.equal(assessQuality(r).proceed, true, r)
  }
})

test('MEDIUM halts, which is the expensive choice and the required one', () => {
  // Enquadramento §9 and specification §10: halt on ANY drop below green. Not
  // only on LOW, because by LOW the messaging limit is already moving.
  for (const r of ['MEDIUM', 'YELLOW']) {
    const v = assessQuality(r)
    assert.equal(v.proceed, false, r)
    if (!v.proceed) {
      assert.equal(v.severity, 'warning')
      assert.match(v.reason, /below green/)
    }
  }
})

test('LOW halts critically', () => {
  for (const r of ['LOW', 'RED']) {
    const v = assessQuality(r)
    assert.equal(v.proceed, false)
    if (!v.proceed) assert.equal(v.severity, 'critical')
  }
})

test('AN UNRECOGNISED RATING HALTS, because the documented values are examples', () => {
  // Twilio's docs give "HIGH" as an example and do not enumerate the set. If a
  // new value were treated as good, every future value Meta invents would be a
  // silent pass — on the check protecting the live number.
  for (const r of ['EXCELLENT', 'UNKNOWN', 'TIER_2', 'flagged']) {
    const v = assessQuality(r)
    assert.equal(v.proceed, false, r)
    if (!v.proceed) {
      assert.equal(v.severity, 'critical')
      assert.match(v.reason, /Unrecognised quality rating/)
    }
  }
})

test('AN UNREADABLE RATING HALTS: "the check broke" must not be quieter than "the check said no"', () => {
  for (const r of [null, undefined, '', '   ']) {
    const v = assessQuality(r)
    assert.equal(v.proceed, false, String(r))
    if (!v.proceed) {
      assert.equal(v.rating, null)
      assert.match(v.reason, /cannot be wrong in the expensive direction/)
    }
  }
})

test('a reader that throws produces a halt naming the failure, not a null rating', async () => {
  const reader: SenderReader = { async qualityRating() { throw new Error('503 from Senders API') } }
  const d = await checkBeforeBatch({ senderSid: 'XE1', reader, at: new Date('2026-09-18T09:00:00Z') })
  assert.equal(d.halt, true)
  assert.match(d.haltedReason!, /quality unreadable/)
  assert.match(d.haltedReason!, /503 from Senders API/,
    'the underlying error must survive into the halt reason, or the operator debugs blind')
})

test('a halt always produces a reason, because 0018 refuses a halted run without one', async () => {
  for (const rating of ['MEDIUM', 'LOW', 'WHAT', null]) {
    const reader: SenderReader = { async qualityRating() { return rating } }
    const d = await checkBeforeBatch({ senderSid: 'XE1', reader })
    assert.equal(d.halt, true, String(rating))
    assert.ok(d.haltedReason && d.haltedReason.length > 30,
      `${rating} halted with no usable reason — campaign_runs.halted_reason would be empty`)
  }
})

test('proceeding produces no halt reason, so an empty one cannot mean two things', async () => {
  const reader: SenderReader = { async qualityRating() { return 'HIGH' } }
  const d = await checkBeforeBatch({ senderSid: 'XE1', reader })
  assert.equal(d.halt, false)
  assert.equal(d.haltedReason, null)
})

test('A HALTED RUN CANNOT BE RESUMED, and the refusal is reachable from code', () => {
  // A function rather than a comment, so a future "resume" button has something
  // to call that says no — and says why.
  const r = mayResumeHaltedRun()
  assert.equal(r.may, false)
  assert.match(r.reason, /Re-evaluate/)
  assert.match(r.reason, /send path that skipped evaluation/)
  assert.match(r.reason, /never two touches in a week/,
    'the re-run must lean on the pacing rule rather than special-casing the halt')
})
