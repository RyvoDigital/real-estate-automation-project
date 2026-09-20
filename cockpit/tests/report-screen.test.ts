import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderWeekly, type WeeklyFigures } from '../src/lib/report/attribution'

const PAGE = readFileSync(
  join(import.meta.dirname, '..', 'src', 'app', 'c', '[client]', 'report', 'page.tsx'),
  'utf-8',
)
const READ = readFileSync(join(import.meta.dirname, '..', 'src', 'lib', 'report', 'week-read.ts'), 'utf-8')
const body = PAGE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

const figures = (over: Partial<WeeklyFigures> = {}): WeeklyFigures => ({
  conversations: 41,
  conversationsFromCampaign: 12,
  conversationsUnattributed: 0,
  qualified: 9,
  qualifiedFromCampaign: 3,
  meetings: 4,
  meetingsFromCampaign: 1,
  subsetOf: {},
  ...over,
})

/*
 * Brief III §11. Commercially load-bearing, which here is the same weight as
 * legally: the report is what the client relies on.
 */

test('🔴 the artefact carries no total, because the lie enters at the sum', () => {
  /*
   * "41 conversations + 12 reactivations = 53 contacts" is false — a
   * reactivated contact who becomes a live enquiry is genuinely both. So the
   * subset sits INDENTED under the figure it is part of, and there is no total
   * line anywhere.
   */
  const out = renderWeekly(figures())
  assert.doesNotMatch(out, /total/i, 'the artefact contains a total')
  assert.doesNotMatch(out, /\bsoma\b/i, 'the artefact contains a sum')

  // And the subset really is indented under its parent, which IS the logic.
  const lines = out.split('\n')
  const parent = lines.findIndex((l) => /^Conversas recebidas/.test(l))
  assert.ok(parent > -1)
  assert.match(lines[parent + 1], /^ {2}\S/, 'the reactivation line is not indented under its parent')
})

test('🔴 a number we do not know is never folded into one we do', () => {
  // attribution_state 'unknown' means the lookup FAILED. It is a third thing.
  const out = renderWeekly(figures({ conversationsUnattributed: 7 }))
  assert.match(out, /sem origem determinada/, 'the unattributed block is missing')
  assert.match(out, /não entra em nenhum dos números acima/, 'it does not say it is excluded from the figures above')
  // It is not added to either.
  assert.match(out, /Conversas recebidas\s+41/)
})

test('🔴 a missing day withholds EVERY figure, not a six-day total', () => {
  /*
   * The check happens before the figures are computed, so there is no moment
   * at which a six-day total sits in a variable waiting to be rendered by
   * mistake.
   */
  assert.match(READ, /if \(report\.missingDays\.length > 0\) \{[\s\S]{0,200}?figures: null/, 'figures are computed before the missing-day check')
  assert.match(body, /withheldBecause\.length > 0/)
  assert.match(PAGE, /withheld rather than\s*\n?\s*summed over six days/)
})

test('🔴 there is NO send control on a held week — not a greyed one', () => {
  /*
   * §0.4-7, and the design records that a disabled button still read as
   * pressable in the first render. A report that cannot honestly be sent must
   * not look one click from going.
   */
  assert.ok(!/<button/i.test(body), 'the report screen has acquired a button')
  assert.ok(!/disabled/.test(body), 'a disabled control appeared on the report screen')
  assert.match(PAGE, /There is no control here, rather than a greyed one/)
})

test('🔴 the three day-states stay three', () => {
  // Collapsing `missing` and `future` painted the rest of the current week as
  // a failure in the first version — a check that alarms on a normal state.
  assert.match(body, /d\.state === 'derived'/)
  assert.match(body, /d\.state === 'missing'/)
  assert.match(body, /'not yet'/, 'the future state has no distinct word')
  assert.match(body, /styles\.future/, 'the future state has no distinct rendering')
})

test('🔴 qualification is not derived from a current stage', () => {
  /*
   * `leads.stage` is a CURRENT value: a contact qualified in August would be
   * counted into this week's report. Found while building, recorded as
   * improvements §3.27, and withheld by the same mechanism as a missing day
   * rather than emitted as a zero — a zero would understate the automation the
   * report exists to show.
   */
  // 🔴 Comments AND string literals stripped — §1t. The withholding's own
  // explanation has to name `leads.stage` to say why it is not used, and a
  // detector that fired on that sentence would be the fifth instance today of
  // a check matching the text describing it.
  const code = READ.replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
  assert.ok(!/\bstage\b/.test(code), 'the week read still touches leads.stage')
  assert.match(READ, /qualified: false/)
  assert.match(READ, /QUALIFICATION_NOT_DERIVABLE/)
  assert.match(body, /cannotDerive/, 'the page does not surface the undeliverable figure')
})

test('S1 is a legitimate report and does not look like a broken one', () => {
  assert.match(PAGE, /the zeros mean nothing happened rather than\s*\n?\s*something failing/)
  assert.match(PAGE, /which is a report, not the absence of one/)
})

test('the absences name none of the forbidden words', () => {
  /*
   * §0.4-9: a page never forbids a word by printing it. The first draft of this
   * list did, which is the same mistake as the re-check notice.
   */
  const absences = PAGE.slice(PAGE.indexOf('What this page does not do'))
  assert.doesNotMatch(absences, /\bviewings?\b/i, 'the absences print the word they exist to avoid')
})
