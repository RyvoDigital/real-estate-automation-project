import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const PAGE = readFileSync(
  join(import.meta.dirname, '..', 'src', 'app', 'c', '[client]', 'review', 'page.tsx'),
  'utf-8',
)
const body = PAGE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

/*
 * Brief II §3.10. The screen is CONTESTED BY DESIGN: the ask list is always
 * shorter than the sales list, somebody will read that as a bug, and closing it
 * is the offence rather than the fix.
 */

test('🔴 the page cannot grow a control, and specifically not a skip', () => {
  /*
   * "A skip button would be the offence with an audit trail showing who
   * committed it." Guarded structurally, because the design says guarded
   * TWICE and a comment is not one of the two.
   */
  assert.ok(!/<button/i.test(body), 'the review screen has acquired a button')
  assert.ok(!/<form/i.test(body), 'the review screen has acquired a form')
  assert.ok(!/onClick|formAction|action=/.test(body), 'the review screen has acquired an action')
  assert.ok(!/\bskip\b/i.test(body) || /no per-sale skip/i.test(PAGE), 'a skip control appeared')
})

test('🔴 the three counts are rendered together, with the gap beside them', () => {
  /*
   * §S6: closes, asked, pending — side by side, with the gap explained. A
   * headline with footnotes is how the difference becomes a surprise, and a
   * discrepancy that is displayed and explained does not get investigated as a
   * defect.
   */
  assert.match(body, /gap!\.closes/)
  assert.match(body, /gap!\.asked/)
  assert.match(body, /gap!\.difference/)
  // And the reasons are rendered, not summarised away.
  assert.match(body, /gap!\.lines\.map/, 'the per-reason breakdown is not rendered')
})

test('🔴 unexplained is its own section, because it is the only finding', () => {
  /*
   * "Two hundred historical closes reporting as findings would hide the one
   * genuine skip, and the genuine skip is the only output that means
   * anything." So `unaccounted` must never be mixed into the reason list.
   */
  assert.match(body, /gap!\.unexplained === 0/)
  assert.match(body, /the only output here that is a finding/)
  assert.match(PAGE, /This is the genuine skip/)
})

test('🔴 a reconciliation that did not run says so, and is not a clean result', () => {
  // S3, and today's state. An unrun report and an empty one are opposite
  // claims that would otherwise render as the same page.
  assert.match(body, /!s\.report\.checked/)
  assert.match(PAGE, /That is not a clean result — it is the absence of/)
})

test('🔒 the limits are on the screen, never in a footnote', () => {
  // A clean report is a statement about our own rows. Presenting it as a
  // statement about the agency's sales is the system making a claim about the
  // world from a count of its own records.
  assert.match(body, /s\.report\.limits\.map/, 'the limits are not rendered')
  assert.match(PAGE, /What this check cannot see/)
})
