import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  parseRehearsal,
  rehearsalToColumn,
  REHEARSAL_OPTIONS,
  REHEARSAL_UNANSWERED,
  type RehearsalAnswer,
} from '../src/lib/rehearsal'
import { validate } from '../src/lib/onboarding'
import { good as DRAFT } from './fixtures/onboarding-draft'

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * THE COLUMN HAS NO DEFAULT, SO NOTHING MAY ANSWER ON ANYBODY'S BEHALF.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `0037` gives `clients.rehearsal` no default because a default would assert an
 * answer nobody gave (lesson 13). Every test here is about one thing: that the
 * default does not come back somewhere else — in a parser's fallback, in a
 * form's initial state, or in an insert's `?? false`.
 *
 * 🔴 The failure this prevents is silent and slow. A rehearsal client recorded
 * as real does not break anything today. It shows up months later as revenue
 * that never existed and a "first client" dated to a test fixture, on the page
 * read every morning.
 */

test('🔴 only the two real answers parse; everything else is UNANSWERED', () => {
  assert.equal(parseRehearsal('real'), 'real')
  assert.equal(parseRehearsal('rehearsal'), 'rehearsal')
  assert.equal(parseRehearsal(' real '), 'real', 'a trimmed value is still an answer')

  /*
   * Each of these is a way somebody could arrive with no decision made. If any
   * returned a boolean, that would be the default reinstated in a parser — and
   * "true" is the dangerous direction as often as "false": a real agency marked
   * rehearsal drops out of the business's numbers quietly.
   */
  for (const bad of ['', '   ', 'yes', 'no', 'true', 'false', 'Real', 'REHEARSAL', null, undefined, 0, 1, true, false, {}]) {
    assert.equal(parseRehearsal(bad), null, `${JSON.stringify(bad)} parsed as an answer`)
  }
})

test('the column value is total over the answer, so no branch can invent one', () => {
  assert.equal(rehearsalToColumn('rehearsal'), true)
  assert.equal(rehearsalToColumn('real'), false)
  // And the type admits exactly two, so there is no third case to forget.
  const all: RehearsalAnswer[] = REHEARSAL_OPTIONS.map((o) => o.value)
  assert.deepEqual([...all].sort(), ['real', 'rehearsal'])
})

test('🔴 an unanswered draft is REFUSED, and the message says why it matters', () => {
  const errors = validate({ ...DRAFT, rehearsal: '' })
  const mine = errors.filter((e) => e.field === 'rehearsal')
  assert.equal(mine.length, 1, 'an unanswered rehearsal choice was not refused')
  assert.equal(mine[0].message, REHEARSAL_UNANSWERED)

  // It explains the consequence rather than only naming the field. The
  // consequence is the reason the question exists and it is not obvious.
  assert.match(mine[0].message, /no default, on purpose/i)
  assert.match(mine[0].message, /months later/i)

  // And a draft that answers is not refused for this.
  for (const v of ['real', 'rehearsal']) {
    assert.equal(
      validate({ ...DRAFT, rehearsal: v }).filter((e) => e.field === 'rehearsal').length,
      0,
      `a draft answering "${v}" was refused`,
    )
  }
})

// ── where the default would come back ───────────────────────────────────────

const ONBOARDING = readFileSync(join(import.meta.dirname, '..', 'src', 'components', 'Onboarding.tsx'), 'utf-8')
const ACTIONS = readFileSync(join(import.meta.dirname, '..', 'src', 'lib', 'actions.ts'), 'utf-8')

test('🔴 NOTHING IS PRE-SELECTED — the empty draft leaves the question open', () => {
  /*
   * §4.6: a pre-filled field collects a click, not a decision. Every other
   * field in EMPTY carries a sensible starting value; this one cannot, because
   * a checked radio on load would record an answer nobody gave and would be
   * indistinguishable from one somebody did give.
   *
   * This reads the source because the defect IS the literal. A test that built
   * its own draft would prove nothing about what the form ships with.
   */
  const empty = ONBOARDING.match(/const EMPTY: ClientDraft = \{([\s\S]*?)\n\}/)
  assert.ok(empty, 'the form no longer declares EMPTY as a literal')

  const assignment = empty[1].match(/rehearsal:\s*('[^']*'|"[^"]*")/)
  assert.ok(assignment, 'EMPTY does not mention rehearsal at all')
  assert.match(
    assignment[1],
    /^['"]['"]$/,
    `the form pre-selects ${assignment[1]} — that is 0037's default, written in HTML`,
  )
})

test('the control: the pre-selection detector can see a pre-selection', () => {
  // Without this, "EMPTY has an empty string" and "the regex matched nothing"
  // are the same green.
  const sabotaged = ONBOARDING.replace(/(const EMPTY: ClientDraft = \{[\s\S]*?)rehearsal: ''/, "$1rehearsal: 'real'")
  assert.notEqual(sabotaged, ONBOARDING, 'the sabotage did not apply — EMPTY has changed shape')

  const empty = sabotaged.match(/const EMPTY: ClientDraft = \{([\s\S]*?)\n\}/)
  const assignment = empty![1].match(/rehearsal:\s*('[^']*'|"[^"]*")/)
  assert.ok(assignment)
  assert.doesNotMatch(assignment[1], /^['"]['"]$/, 'the detector cannot see a pre-selected value')
})

test("🔴 the insert writes the column, and never with a fallback", () => {
  /*
   * `?? false` or `|| false` beside this column would be the whole defect in
   * two characters: a draft nobody classified recorded as a real agency. The
   * action re-parses and REFUSES instead, which is why this checks for the
   * refusal as well as for the absence of a fallback.
   */
  assert.match(ACTIONS, /rehearsal: rehearsalToColumn\(answer\)/, 'the insert does not write the column')
  assert.match(ACTIONS, /const answer = parseRehearsal\(draft\.rehearsal\)/)
  assert.match(ACTIONS, /if \(answer === null\)/, 'the action does not refuse an unanswered draft')

  const nearby = ACTIONS.slice(
    Math.max(0, ACTIONS.indexOf('parseRehearsal(draft.rehearsal)') - 200),
    ACTIONS.indexOf('rehearsal: rehearsalToColumn(answer)') + 80,
  )
  assert.doesNotMatch(nearby, /\?\?\s*(true|false)/, 'a fallback sits beside the rehearsal answer')
  assert.doesNotMatch(nearby, /\|\|\s*(true|false)/, 'a fallback sits beside the rehearsal answer')
})

test('both options say what the choice MEANS, not just what it is called', () => {
  assert.equal(REHEARSAL_OPTIONS.length, 2)
  for (const o of REHEARSAL_OPTIONS) {
    assert.ok(o.label.length > 3, `${o.value}: no label`)
    assert.ok(o.means.length > 25, `${o.value}: does not say what it means where it matters`)
  }
  // The real one says it counts; the rehearsal one says it does not. If those
  // ever read the same way the question stops being answerable.
  const real = REHEARSAL_OPTIONS.find((o) => o.value === 'real')!
  const rehearsal = REHEARSAL_OPTIONS.find((o) => o.value === 'rehearsal')!
  assert.match(real.means, /counts towards/i)
  assert.match(rehearsal.means, /kept out of/i)
  assert.notEqual(real.means, rehearsal.means)
})

test('🔴 no field that is a FACT ABOUT THE AGENCY is pre-filled', () => {
  /*
   * `rehearsal` was the first one caught. It was not the only one: timezone,
   * locale and defaultLanguage were all pre-filled with Portuguese values,
   * while their placeholders showed Spanish examples that could never render.
   * The form proposed Spain and recorded Portugal.
   *
   * 🔒 THE LINE IS WHO THE QUESTION IS ABOUT, not whether a sensible value
   * exists. A booking window of 14 days is Ryvo's default and stays a value —
   * nobody is answered for, because it is not a question about them. Only the
   * agency can say what timezone it works in.
   */
  const empty = ONBOARDING.match(/const EMPTY: ClientDraft = \{([\s\S]*?)\n\}/)
  assert.ok(empty, 'the form no longer declares EMPTY as a literal')
  const body = empty[1].replace(/\/\*[\s\S]*?\*\//g, '')

  const ABOUT_THE_AGENCY = ['timezone', 'locale', 'defaultLanguage', 'rehearsal', 'agencyName', 'areas', 'agentName']
  for (const f of ABOUT_THE_AGENCY) {
    const m = body.match(new RegExp(`\\b${f}:\\s*('[^']*'|"[^"]*")`))
    assert.ok(m, `EMPTY no longer sets ${f}`)
    assert.match(m[1], /^['"]['"]$/, `${f} is pre-filled with ${m[1]} — that is a guess wearing a choice`)
  }

  // And the four that ARE ours stay ours, so this does not quietly become
  // "blank everything", which would turn a default we may hold into typing.
  const OURS = ['bookingWindowDays', 'minHoursNotice', 'viewingDurationMinutes', 'highValueThresholdEur']
  for (const f of OURS) {
    const m = body.match(new RegExp(`\\b${f}:\\s*('[^']*')`))
    assert.ok(m && m[1] !== "''", `${f} was blanked — it is Ryvo's default, not a question about the agency`)
  }
})

test('the fixtures declare themselves rehearsal — 0038 precondition 3', () => {
  /*
   * After 0038 sets NOT NULL, an insert omitting the column fails. The shared
   * draft fixture is a rehearsal by definition, and saying so here means the
   * day 0038 lands is not the day the fixtures break.
   */
  assert.equal(DRAFT.rehearsal, 'rehearsal')
  assert.equal(parseRehearsal(DRAFT.rehearsal), 'rehearsal')
})
