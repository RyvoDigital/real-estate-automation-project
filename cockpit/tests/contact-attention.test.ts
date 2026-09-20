import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ATTENTION_CAP, ATTENTION_WINDOW_DAYS, REASON_MEANS } from '../src/lib/contact/attention'
import { ANOMALY_WINDOW_DAYS } from '../src/lib/data'

/*
 * The attention set's two rules, both from the operator on 20 September 2026:
 * it holds only contacts with something currently wrong, and its cap is stated
 * rather than applied silently.
 */

test('🔴 "recent" means the same thing here as on the anomalies screen', () => {
  /*
   * Two screens that both answer "what needs doing" disagreeing about what
   * recent means is a defect nobody would ever diagnose. They would simply,
   * quietly, mean different things, and an operator would carry two
   * incompatible ideas of the same word between two tabs.
   *
   * The reason is the MATCH, not the number. If seven days turns out to be
   * wrong it is wrong in both places.
   */
  assert.equal(
    ATTENTION_WINDOW_DAYS,
    ANOMALY_WINDOW_DAYS,
    'the contact attention window and the anomaly window have drifted apart',
  )
})

test('every reason is something that needs DOING, not something that happened', () => {
  /*
   * 🔒 The rule that stops this becoming the browsable list by another name.
   * "Recently active" and "most messaged" are a browse wearing a filter.
   */
  const reasons = Object.keys(REASON_MEANS)
  assert.deepEqual(reasons.sort(), ['quarantined_claim', 'recent_refusal', 'unresolved_send'])
  for (const [k, v] of Object.entries(REASON_MEANS)) {
    assert.ok(v.length > 25, `${k}: does not say what it means`)
    assert.doesNotMatch(v, /\b(active|recent(ly)? (seen|active)|most|top|busiest|engaged)\b/i, `${k} reads as a browse`)
  }
})

test('🔴 the unresolved state is NOT windowed, because it does not expire', () => {
  /*
   * "We do not know whether this person received a message" does not stop
   * being true after a week — it stops being true when somebody reconciles it.
   * Windowing it would quietly retire the only state on the screen that never
   * resolves on its own.
   */
  const src = readFileSync(join(import.meta.dirname, '..', 'src', 'lib', 'contact', 'attention.ts'), 'utf-8')
  const block = src.slice(src.indexOf(".eq('status', 'unresolved')") - 400, src.indexOf(".eq('status', 'unresolved')") + 200)
  assert.ok(block.length > 100, 'the unresolved query has moved')
  assert.doesNotMatch(block, /\.gte\('intent_recorded_at', since\)/, 'the unresolved query acquired a window')

  // And the refusal query IS windowed, or the set grows without bound and
  // becomes the browsable list.
  assert.match(src, /\.gte\('gate_decided_at', since\)/, 'the refusal query lost its window')
})

test('the cap is a number the page can state, not a silent slice', () => {
  assert.ok(ATTENTION_CAP > 0 && ATTENTION_CAP <= 50)
  const page = readFileSync(
    join(import.meta.dirname, '..', 'src', 'app', 'c', '[client]', 'contacts', 'page.tsx'),
    'utf-8',
  )
  // 🔒 A list of ten meaning "ten" and one meaning "at least ten" are different
  // facts. The page must say which it is showing.
  assert.match(page, /more than/, 'the page does not say the cap means "at least this many"')
  assert.match(page, /a cap, not a total/)
})

test('the search normalises before looking, and does not list', () => {
  const page = readFileSync(
    join(import.meta.dirname, '..', 'src', 'app', 'c', '[client]', 'contacts', 'page.tsx'),
    'utf-8',
  )
  assert.match(page, /toE164\(asked\)/, 'the search does not normalise, so one contact reads as three')
  assert.match(page, /redirect\(contactHref\(/, 'a hit should go straight to the record rather than being listed')
})
