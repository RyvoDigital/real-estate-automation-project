/*
 * 🔴 A PREVIEW RENDERS WHAT THE PAGE RENDERS (23 Sep 2026, brief §0.5).
 *
 * Every operator screen is reviewed by rendering it outside Next and
 * screenshotting the result. That only works while the preview draws the page's
 * OWN components in the page's OWN layout. The moment it wraps them in
 * something hand-written, it is showing a screen that does not exist.
 *
 * It cost two defects in one day:
 *   - render-month-preview wrapped the forms in `style={{ marginTop: 32 }}`,
 *     which is exactly the separation the real page did NOT have — so the
 *     collision between "What this page does not do" and "Record a contract"
 *     was invisible in every screenshot for as long as it existed;
 *   - the onboarding preview did the opposite, rendered the real grid, and
 *     caught a layout bug that no test could see. Twice.
 *
 * A preview that does not render what the page renders is a test that cannot
 * fail, and this is that rule with teeth.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const TESTS = new URL('./', import.meta.url).pathname
const previews = readdirSync(TESTS).filter((f) => /^render-.*\.tsx$/.test(f))

test('🔴 no preview lays out a screen by hand: no inline style in the JSX', () => {
  assert.ok(previews.length >= 6, `only ${previews.length} previews found — the scan is broken`)
  const offences: string[] = []
  for (const f of previews) {
    const src = readFileSync(join(TESTS, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    /*
     * The page chrome a preview needs — a SAMPLE banner, the body background —
     * lives in the HTML string it writes, never in the JSX it renders. So an
     * inline style in the JSX is always a layout the page does not have.
     */
    for (const m of src.matchAll(/style=\{\{([^}]*)\}\}/g)) offences.push(`${f}: style={{${m[1].trim()}}}`)
  }
  assert.deepEqual(offences, [], `a preview is laying a screen out by hand, so its screenshots show a screen that does not exist:\n  ${offences.join('\n  ')}`)
})

test('🔒 every preview renders the real component, not a copy of it', () => {
  for (const f of previews) {
    const src = readFileSync(join(TESTS, f), 'utf8')
    assert.match(src, /from '\.\.\/src\//, `${f} imports nothing from src: it is drawing its own screen`)
  }
})

test('🔒 the rule is written where the next person looks', () => {
  const brief = readFileSync(new URL('../../docs/cockpit-design-brief.md', import.meta.url), 'utf8')
  assert.match(brief, /A preview renders what the page renders/)
  assert.match(brief, /a test that cannot fail/)
})

test('🔒 the control: the detector would catch the defect it was written for', () => {
  // The exact shape that hid The Month's collision.
  const bad = 'const x = <div style={{ marginTop: 32 }}><Entry /></div>'
  assert.match(bad, /style=\{\{([^}]*)\}\}/, 'the detector no longer matches an inline style')
})
