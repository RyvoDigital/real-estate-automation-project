/*
 * /ops/expiries checkpoint 2 (22 Sep 2026): the screen's rules, read from the
 * source (the render is checked by tests/render-expiries-preview.tsx, which
 * asserts on the drawn HTML before it writes a screenshot page).
 *   1. EVERY WRITE FORM MINTS ITS OWN ID when drawn: one Hidden per form.
 *   2. 🔴 NO CARD NUMBER: the only card-digit field is the last four, capped at 4.
 *   3. THE PROCURAÇÃO'S ANSWER AND THE RENEW/CORRECT ACT ARE CHOSEN, never defaulted.
 *   4. A RENEWAL STARTS EMPTY: no visible field carries a value.
 *   5. RETIRING IS ASKED TWICE, naming the obligation, and nothing else is.
 *   6. FAILED READS AND UN-CHECKED CAUSES ARE SAID, as banners.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const code = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')
const VIEW = code('../src/components/expiries/ExpiriesView.tsx')
const PAGE = code('../src/app/ops/expiries/page.tsx')

test('🔒 every write form carries a freshly minted id: each <form> holds a Hidden, and Hidden mints per render', () => {
  const forms = [...VIEW.matchAll(/<form\b[\s\S]*?<\/form>/g)].map((m) => m[0])
  assert.ok(forms.length >= 4, `only ${forms.length} forms found — this guard would pass vacuously`)
  for (const f of forms) assert.match(f, /<Hidden\b/, `a write form without its own id:\n${f.slice(0, 200)}`)
  const hidden = VIEW.slice(VIEW.indexOf('function Hidden'), VIEW.indexOf('function KindFields'))
  assert.match(hidden, /name="actId" value=\{randomUUID\(\)\}/)
  assert.doesNotMatch(VIEW, /const\s+\w+\s*=\s*randomUUID\(\)/, 'an id minted once and shared would make two forms one act')
})

test('🔴 no card number is asked for: the only digit field for a card is the last four, maxLength 4', () => {
  const names = [...VIEW.matchAll(/name="(\w+)"/g)].map((m) => m[1])
  assert.ok(names.includes('cardLastFour'))
  for (const n of names) assert.doesNotMatch(n, /card(Number|Num|Pan)|^pan$|cvv|cvc/i, `a field that could hold a card number: ${n}`)
  const four = VIEW.match(/<input name="cardLastFour"[^>]*>/)?.[0] ?? ''
  assert.match(four, /maxLength=\{4\}/)
  assert.match(four, /pattern="\[0-9\]\{4\}"/)
})

test('🔒 the procuração answer and the renew/correct act start unchosen', () => {
  const radios = [...VIEW.matchAll(/<input type="radio"[^>]*>/g)].map((m) => m[0])
  assert.equal(radios.length, 4, 'two procuração answers and two acts')
  for (const r of radios) assert.doesNotMatch(r, /\b(defaultChecked|checked)\b/, `a radio is pre-chosen: ${r}`)
  // The renew/correct form must NOT carry a hidden act, or the radios would be decoration.
  const renew = VIEW.slice(VIEW.indexOf('<summary>Renew or correct'), VIEW.indexOf('<summary>Retire'))
  assert.match(renew, /<Hidden o=\{o\} \/>/)
  assert.doesNotMatch(renew, /<Hidden act=/)
})

test('🔒 a renewal or correction starts EMPTY: no visible field carries a value; the current values are text beside it', () => {
  const fields = VIEW.slice(VIEW.indexOf('function KindFields'), VIEW.indexOf('function CheckedForm'))
  const tags = [...fields.matchAll(/<(input|textarea)\b[^>]*>/g)].map((m) => m[0]).filter((t) => !/type="radio"/.test(t))
  assert.ok(tags.length >= 6, 'no fields found — this guard would pass vacuously')
  for (const t of tags) assert.doesNotMatch(t, /\bvalue=|defaultValue=/, `a field is pre-filled: ${t}`)
  assert.match(fields, /now: \{text/)
})

test('🔴 failed reads and un-checked causes are banners, and the S1 note carries its denominators', () => {
  assert.match(VIEW, /\{e\.failures\.length > 0 && \(\s*<StateSurface meaning="red"/)
  assert.match(VIEW, /\{e\.notCheckedFor\.length > 0 && \([\s\S]{0,200}<StateSurface meaning="red"/)
  assert.match(VIEW, /Checked \{c\.clearances\} clearance/)
  assert.match(VIEW, /Not tracked yet: \{e\.notTracked\.join/)
})

test('the page is operator-only, reads the one expiries module, and renders in the operator frame', () => {
  assert.match(PAGE, /await requireOperator\(\)/)
  assert.match(PAGE, /readExpiries\(new Date\(\)\)/)
  assert.match(PAGE, /<Frame mode="operator" current="expiries"/)
  assert.match(PAGE, /refusal=\{refusalFrom\(sp\)\}/)
})


/*
 * 🔒 RETIRING IS THE SECOND STEP (22 Sep 2026, Manuel's decision). It is the
 * one act no later record can undo, so the form names the obligation, says what
 * retiring does, and needs a box that nothing ticks and nothing focuses in
 * advance. obligations-core refuses it if the box does not come back ticked,
 * so this guard is about the words the operator is shown.
 */
test('🔒 retiring asks a second time, naming the obligation, with nothing pre-ticked or pre-focused', () => {
  const retire = VIEW.slice(VIEW.indexOf('<summary>Retire<'), VIEW.indexOf('function AddForm'))
  assert.match(retire, /Retire \{nameOf\(o\)\}\?/, 'the question must name the obligation')
  assert.match(retire, /cannot be brought back/)
  assert.match(retire, /enter it again as a new obligation/)
  const box = retire.match(/<input type="checkbox"[^>]*>/)?.[0] ?? ''
  assert.match(box, /name="confirm" value="yes"/, 'the confirmation is a value we asked for, not a box default')
  assert.match(box, /\brequired\b/)
  assert.doesNotMatch(box, /\b(defaultChecked|checked|autoFocus)\b/)
  assert.doesNotMatch(VIEW, /autoFocus/, 'nothing on this screen is focused in advance, the confirm least of all')
  // The obligation is named the way the operator says it: a card by its last four.
  const named = VIEW.slice(VIEW.indexOf('function nameOf'), VIEW.indexOf('function ObligationActions'))
  assert.match(named, /card_last_four/)
})

test('🔒 only retiring asks: check, renew and correct stay one click', () => {
  // The three acts on an existing obligation: CheckedForm, then renew-or-correct and retire.
  const acts = VIEW.slice(VIEW.indexOf('function CheckedForm'), VIEW.indexOf('function AddForm'))
  const forms = [...acts.matchAll(/<form\b[\s\S]*?<\/form>/g)].map((m) => m[0])
  assert.equal(forms.length, 3, 'checked, renew-or-correct and retire')
  const asking = forms.filter((f) => /name="confirm"/.test(f))
  assert.equal(asking.length, 1, 'exactly one act asks a second time')
  assert.match(asking[0], /act="retired"/)
})
