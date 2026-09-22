/*
 * /calibrate checkpoint 2 (22 Sep 2026): the screen's two decisions.
 *   1. NOTHING IS PRE-FILLED: every field starts empty; the previous sitting is
 *      shown BESIDE the fields, as reference, with its date and who answered.
 *   2. A FAILED READ IS SHOWN AS FAILED, never as "not calibrated yet".
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { calibrationScreenFrom } from '../src/lib/matching/calibrate-read'
import { referenceLines, sittingDate } from '../src/lib/matching/calibrate-reference'
import { CALIBRATE } from '../src/lib/matching/screen-copy'
import { EMPTY_ANSWERS } from '../src/lib/matching/thresholds'
import { operatorName } from '../src/lib/operators'

const code = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')
const FORM = code('../src/components/calibrate/CalibrateForm.tsx')
const VIEW = code('../src/components/calibrate/CalibrateView.tsx')

const T = { budget_stretch: 0.05, budget_stretch_with_evidence: 0.15, bedrooms_tolerance: 1, area_adjacency: {}, min_score_strong: 0.8, min_score_possible: 0.6 }
const row = { answers: { ...EMPTY_ANSWERS, budgetSaid: 2000000, budgetMost: 2100000 }, answered_by: 'Marta Soares', recorded_by: 'manuel@ryvodigital.com', recorded_at: '2026-09-12T14:00:00Z', thresholds: T }

test('🔴 A FAILED READ IS A FAILURE: never "no previous sitting", never "not calibrated yet"', () => {
  const s = calibrationScreenFrom({ data: { id: 'c1', name: 'Marbella Sur' }, error: null }, { data: null, error: { message: 'timeout' } })
  assert.equal(s.previous, null)
  assert.match(s.failure ?? '', /calibration_records: timeout/)
  const c = calibrationScreenFrom({ data: null, error: { message: 'down' } }, { data: [row], error: null })
  assert.match(c.failure ?? '', /clients: down/)
  // And the view only ever says "not answered" when nothing failed.
  const at = VIEW.indexOf('CALIBRATE.notSavedYet')
  assert.ok(at > 0, 'the view no longer says "not answered yet" at all — this guard would pass vacuously')
  assert.match(VIEW.slice(0, at), /\{!screen\.failure && screen\.client && \([\s\S]*$/, '"not answered yet" must sit inside the no-failure branch')
  assert.match(VIEW, /\{screen\.failure && \([\s\S]{0,200}CALIBRATE\.readFailed/)
})

test('a read that worked and found no sitting is "not answered yet"; one that found one is the reference', () => {
  const none = calibrationScreenFrom({ data: { id: 'c1', name: 'M' }, error: null }, { data: [], error: null })
  assert.deepEqual([none.previous, none.failure], [null, null])
  const one = calibrationScreenFrom({ data: { id: 'c1', name: 'M' }, error: null }, { data: [row], error: null })
  assert.equal(one.previous?.answeredBy, 'Marta Soares')
  assert.equal(one.previous?.recordedBy, 'manuel@ryvodigital.com')
})

test('🔴 NOTHING IS PRE-FILLED: no answer field carries a value, the previous sitting included', () => {
  // The only values in the form are the two hidden ids and the select's options; the select starts on "choose one".
  for (const m of FORM.matchAll(/<(input|textarea|select)\b[^>]*>/g)) {
    const tag = m[0]
    if (/type="hidden"/.test(tag)) continue
    assert.doesNotMatch(tag, /\bvalue=|defaultValue=\{/, `an answer field is pre-filled: ${tag}`)
    if (/<select/.test(tag)) assert.match(tag, /defaultValue=""/, 'the select must start on the unanswered option')
  }
  assert.ok([...FORM.matchAll(/<input\b/g)].length >= 3, 'no inputs found — this guard would pass vacuously')
  // The reference is TEXT, beside the field, never a control.
  const ref = FORM.slice(FORM.indexOf('const Ref ='), FORM.indexOf('const Num ='))
  assert.doesNotMatch(ref, /<input|<textarea|<select/)
  assert.match(ref, /reference\[f\]/)
})

test('the previous sitting is shown with its date, who answered and who recorded it', () => {
  assert.match(VIEW, /CALIBRATE\.lastSitting\(sittingDate\(prev\.recordedAt\), prev\.answeredBy, operatorName\(prev\.recordedBy\) \?\? CALIBRATE\.ourTeam\)/)
  assert.match(CALIBRATE.lastSitting('12 set. 2026', 'Marta Soares', 'manuel'), /12 set\. 2026.*Marta Soares.*manuel/)
  assert.match(sittingDate('2026-09-12T23:30:00Z'), /13/, 'dated in Lisbon, where 23:30 UTC is the next day')
})

test('each field\'s reference reads in the agent\'s units, and an unanswered one says so', () => {
  const r = referenceLines({ ...EMPTY_ANSWERS, budgetSaid: 2000000, showsOneFewerBedroom: false, ofHowMany: 5, adjacency: 'Cascais: Estoril\n\nSintra: Colares' })
  assert.match(r.budgetSaid, /^€2.000.000$/)
  assert.equal(r.budgetMost, CALIBRATE.noAnswerThen)
  assert.equal(r.showsOneFewerBedroom, CALIBRATE.no)
  assert.equal(r.ofHowMany, '5')
  assert.equal(r.adjacency, 'Cascais: Estoril; Sintra: Colares')
  assert.equal(referenceLines(EMPTY_ANSWERS).adjacency, CALIBRATE.noAreasThen)
})

test('🔴 THE CALIBRATION ID IS MINTED PER DRAWN FORM, AND TRAVELS WITH IT (0056)', () => {
  assert.match(VIEW, /calibrationId=\{randomUUID\(\)\}/)
  assert.doesNotMatch(VIEW.slice(0, VIEW.indexOf('export function CalibrateView')), /randomUUID\(\)/, 'an id minted at module level is shared by every form')
  assert.match(FORM, /type="hidden" name="calibrationId" value=\{calibrationId\}/)
  const action = code('../src/lib/matching/calibrate-actions.ts')
  assert.match(action, /calibrationId: text\('calibrationId'\)/)
  assert.doesNotMatch(action, /randomUUID/)
})

test('who at the agency answers is asked on the form; the recorder never is', () => {
  assert.match(FORM, /<input name="answeredBy"/)
  assert.doesNotMatch(FORM + code('../src/lib/matching/calibrate-actions.ts'), /name="recordedBy"|text\('recordedBy'\)/)
})

test('the form checks with the SAME problemsWith the server runs, and a problem blocks the send', () => {
  assert.match(FORM, /problemsWith\(parseAnswers\(form\)\)/)
  assert.match(FORM, /if \(Object\.keys\(found\)\.length > 0\) e\.preventDefault\(\)/)
})

test('🔴 "who is answering" comes first, before any question', () => {
  const who = FORM.indexOf('name="answeredBy"')
  assert.ok(who > 0, 'no answeredBy field — this guard would pass vacuously')
  for (const q of ['name="budgetSaid"', 'name="showsOneFewerBedroom"', 'name="ofHowMany"', 'name="adjacency"']) {
    const at = q === 'name="budgetSaid"' ? FORM.indexOf('<Num name="budgetSaid"') : FORM.indexOf(q)
    assert.ok(at > who, `${q} comes before who is answering`)
  }
})

test('🔴 the agency sees the recorder by NAME, never an email', () => {
  assert.equal(operatorName('manuelvale@ryvodigital.com'), 'Manuel Vale')
  assert.equal(operatorName(' ManuelVale@RyvoDigital.com '), 'Manuel Vale')
  assert.equal(operatorName('someone@else.com'), null)
  assert.match(VIEW, /operatorName\(prev\.recordedBy\) \?\? CALIBRATE\.ourTeam/)
  assert.doesNotMatch(VIEW, /prev\.recordedBy\)(?! \?\?)/, 'the raw recorder reaches the screen somewhere')
  assert.doesNotMatch(CALIBRATE.ourTeam, /@/)
})
