/*
 * The listing screens, checkpoint 2 (22 Sep 2026): detail, triage, exemption.
 *   1. every write form carries its own id, minted when it is DRAWN;
 *   2. nothing an agency person says is pre-filled;
 *   3. a failed read is shown as failed, and claims nothing it would have decided;
 *   4. a page 404s only when the listing was read and is not there.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const code = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')
const DETAIL = code('../src/components/listings/ListingDetailView.tsx')
const TRIAGE = code('../src/components/listings/TriageView.tsx')
const EXEMPT = code('../src/components/listings/ExemptionView.tsx')
const PICK_ACTION = code('../src/lib/matching/triage-actions.ts')
const EX_ACTION = code('../src/lib/publication/exemption-actions.ts')

test('🔴 EACH PICK FORM CARRIES ITS OWN ID, minted where it is drawn, per contact', () => {
  const body = TRIAGE.slice(TRIAGE.indexOf('export function TriageView'))
  assert.match(body, /g\.contacts\.map\(\(c\) => \([\s\S]*name="pickId" value=\{randomUUID\(\)\}/, 'the id must be minted inside the per-contact form')
  assert.doesNotMatch(TRIAGE.slice(0, TRIAGE.indexOf('export function TriageView')), /randomUUID\(\)/, 'an id minted at module level is shared by every form')
  assert.match(PICK_ACTION, /pickId: text\('pickId'\)/)
  assert.doesNotMatch(PICK_ACTION, /randomUUID/)
})

test('🔴 THE EXEMPTION FORM CARRIES ITS OWN ID, minted where it is drawn', () => {
  assert.match(EXEMPT.slice(EXEMPT.indexOf('export function ExemptionView')), /name="exemptionId" value=\{randomUUID\(\)\}/)
  assert.doesNotMatch(EXEMPT.slice(0, EXEMPT.indexOf('export function ExemptionView')), /randomUUID\(\)/)
  assert.match(EX_ACTION, /exemptionId: text\('exemptionId'\)/)
  assert.doesNotMatch(EX_ACTION, /randomUUID/)
})

test('🔒 nothing the agency says is pre-filled, and the recorder is never a form field', () => {
  for (const [where, src] of [['triage', TRIAGE], ['exemption', EXEMPT]] as const) {
    const answers = [...src.matchAll(/<input name="(declaredBy|reason|basis)"[^>]*>/g)].map((m) => m[0])
    assert.ok(answers.length >= 2, `${where}: no answer inputs found — this guard would pass vacuously`)
    for (const tag of answers) assert.doesNotMatch(tag, /\bvalue=|defaultValue=/, `${where} pre-fills: ${tag}`)
    assert.doesNotMatch(src, /name="recordedBy"/)
  }
  assert.doesNotMatch(PICK_ACTION + EX_ACTION, /text\('recordedBy'\)/)
})

test('🔴 A FAILED READ CLAIMS NOTHING: not "nobody", not "not calibrated"', () => {
  // The detail says "nobody" only when both the matches and the config were read.
  assert.match(DETAIL, /\{!screen\.failures\.matches && !screen\.failures\.config && screen\.matches\.length === 0/)
  // And the read never turns an unread config into "missing thresholds".
  assert.match(code('../src/lib/matching/screen-read.ts'), /missingThresholds: cErr \? \[\] : missingThresholds\(cfg\)/)
  // Every failure is said, with what was thrown.
  for (const [where, src] of [['detail', DETAIL], ['triage', TRIAGE], ['exemption', EXEMPT]] as const) {
    assert.match(src, /failed\.length > 0 && \([\s\S]{0,200}role="alert"/, `${where} does not say what failed`)
  }
})

test('🔒 no picks on a failed read of the picks or the requirements; no exemption form on any failed read', () => {
  assert.match(TRIAGE, /const canPick = !screen\.failures\.picks && !screen\.failures\.requirements/)
  assert.match(TRIAGE, /\{l && canPick && screen\.groups\.map/)
  assert.match(EXEMPT, /const formable = l && failed\.length === 0 && !screen\.rated && screen\.requirementId/)
  assert.match(EXEMPT, /\{formable && \(\s*<form action=\{declareExemptionAction\}/)
})

test('🔒 a page 404s only when the listing was READ and is not there', () => {
  for (const rel of ['../src/app/listings/[id]/page.tsx', '../src/app/listings/[id]/triage/page.tsx', '../src/app/listings/[id]/exemption/page.tsx']) {
    assert.match(code(rel), /if \(!screen\.listing && !screen\.failures\.listing\) notFound\(\)/, `${rel} 404s on a failed read`)
  }
})

test('the triage and exemption pages show the outcome of a save, and an error in words', () => {
  for (const src of [TRIAGE, EXEMPT]) {
    assert.match(src, /\{refusal && <p role="alert"[^>]*>\{say\(SAVE_REFUSALS, locale, refusal\)\}/)
    assert.match(src, /\{guardado && /)
    assert.match(src, /\{jaGuardado && /)
  }
})
