import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  classOf,
  classify,
  detectOutage,
  formatWait,
  humanise,
  minutesSince,
  parseEscalated,
  tierFor,
} from '../src/lib/escalation'

/*
 * These guard the two rules that fail silently — the screen renders either
 * way, so nothing tells you when they break.
 *
 *   §11 item 16 — system, high-value and lead-initiated must be distinct
 *   §5.1.1      — reasons[] is the authority, not reason
 *
 * The fixtures are the shapes the Concierge actually writes, copied from
 * MarkLeadEscalated and MarkMediaEscalated in the workflow export. A test
 * holding its own idea of the shape is lesson 15 of engineering-lessons.md,
 * so where these disagree with the workflow, the workflow is right.
 */

test('the media path does not render blank — it writes reasons[] too', () => {
  const qualification = {
    escalated: {
      at: '2026-09-06T14:08:00.000Z',
      reason: 'media_unprocessable:voice_note',
      reasons: ['media_unprocessable:voice_note'],
    },
  }

  const esc = parseEscalated(qualification)
  assert.ok(esc)
  assert.deepEqual(esc.reasons, ['media_unprocessable:voice_note'])
  assert.equal(classify(esc.reasons).primary, 'system')
  assert.notEqual(humanise(esc.reasons[0]), '')
})

test('reasons[] is the authority — a second reason is not dropped', () => {
  // The case the correction to the spec was about: high-value AND
  // booking-failed. `reason` carries reasons[0] only.
  const qualification = {
    escalated: {
      at: '2026-09-06T10:00:00.000Z',
      reason: 'high_value:3200000>=1500000',
      reasons: ['high_value:3200000>=1500000', 'booking_failed:conflict_burned_id'],
    },
  }

  const esc = parseEscalated(qualification)
  assert.ok(esc)
  assert.equal(esc.reasons.length, 2, 'both reasons survive parsing')

  const { primary, classes } = classify(esc.reasons)
  assert.equal(primary, 'system', 'a broken thing is the headline')
  assert.deepEqual(classes, ['system', 'high_value'], 'both classes render, not just one')
})

test('falls back to reason when reasons[] is absent', () => {
  const esc = parseEscalated({ escalated: { at: null, reason: 'needs_human:wants a person' } })
  assert.ok(esc)
  assert.deepEqual(esc.reasons, ['needs_human:wants a person'])
})

test('a lead with no escalation parses to null, not to an empty escalation', () => {
  assert.equal(parseEscalated({}), null)
  assert.equal(parseEscalated(null), null)
  assert.equal(parseEscalated({ escalated: null }), null)
})

test('the three classes are distinct — item 16', () => {
  assert.equal(classOf('claude_failed:api_error'), 'system')
  assert.equal(classOf('bad_reply_twice'), 'system')
  assert.equal(classOf('booking_failed:conflict_burned_id'), 'system')
  assert.equal(classOf('no_availability:window_full'), 'system')
  assert.equal(classOf('media_unprocessable:voice_note'), 'system')

  assert.equal(classOf('high_value:3200000>=1500000'), 'high_value')

  assert.equal(classOf('needs_human'), 'person')
  assert.equal(classOf('needs_human:asked about financing'), 'person')

  // The distinction that matters: a €3.2M lead the AI handled perfectly
  // must not be classed with an outage.
  assert.notEqual(classOf('high_value:3200000>=1500000'), classOf('claude_failed:api_error'))
})

test('escalation_reason is not an enum — unknown free text still renders', () => {
  const odd = 'needs_human:quer falar sobre a escritura com um advogado'
  assert.equal(classOf(odd), 'person')
  assert.ok(humanise(odd).includes('escritura'), 'free text survives to the screen')

  // A reason nobody anticipated returns itself rather than an empty label.
  assert.equal(humanise('something_new_entirely'), 'something_new_entirely')
})

test('high_value is humanised with both numbers', () => {
  assert.equal(
    humanise('high_value:3200000>=1500000'),
    'Budget €3.2M against a €1.5M threshold',
  )
})

test('tier thresholds sit where the spec puts them', () => {
  assert.equal(tierFor(0), 0)
  assert.equal(tierFor(29), 0)
  assert.equal(tierFor(30), 1)
  assert.equal(tierFor(89), 1)
  assert.equal(tierFor(90), 2)
  assert.equal(tierFor(239), 2)
  // The four-hour line the screen exists to prevent someone crossing.
  assert.equal(tierFor(240), 3)
  assert.equal(tierFor(1000), 3)
})

test('wait formatting', () => {
  assert.equal(formatWait(0), '0m')
  assert.equal(formatWait(14), '14m')
  assert.equal(formatWait(60), '1h 00m')
  assert.equal(formatWait(252), '4h 12m')
})

test('minutesSince tolerates a missing or malformed timestamp', () => {
  assert.equal(minutesSince(null), 0)
  assert.equal(minutesSince('not a date'), 0)
  const now = Date.parse('2026-09-06T18:12:00.000Z')
  assert.equal(minutesSince('2026-09-06T14:00:00.000Z', now), 252)
})

test('an outage is a cluster, and a busy day is not', () => {
  const now = Date.parse('2026-09-06T18:00:00.000Z')

  // Three leads dropped by the same fault inside four minutes.
  const outage = detectOutage(
    [
      { at: '2026-09-06T17:56:00.000Z', reasons: ['claude_failed:api_error'] },
      { at: '2026-09-06T17:57:00.000Z', reasons: ['claude_failed:api_error'] },
      { at: '2026-09-06T17:58:00.000Z', reasons: ['claude_failed:api_error'] },
    ],
    now,
  )
  assert.equal(outage.active, true)
  assert.equal(outage.count, 3)
  assert.equal(outage.reason, 'claude_failed')

  // A busy day: three people asking for a human. This is the case that
  // must NOT raise the banner — it is instance 9 of the lessons file, an
  // outage and healthy demand looking identical.
  const busy = detectOutage(
    [
      { at: '2026-09-06T17:56:00.000Z', reasons: ['needs_human:financing'] },
      { at: '2026-09-06T17:57:00.000Z', reasons: ['needs_human:legal'] },
      { at: '2026-09-06T17:58:00.000Z', reasons: ['high_value:3000000>=1500000'] },
    ],
    now,
  )
  assert.equal(busy.active, false)

  // Assorted unrelated faults spread over hours are not an outage either.
  const scattered = detectOutage(
    [
      { at: '2026-09-06T17:58:00.000Z', reasons: ['booking_failed:conflict_burned_id'] },
      { at: '2026-09-06T14:00:00.000Z', reasons: ['claude_failed:api_error'] },
      { at: '2026-09-06T11:00:00.000Z', reasons: ['media_unprocessable:voice_note'] },
    ],
    now,
  )
  assert.equal(scattered.active, false)
})
