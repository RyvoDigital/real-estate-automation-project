/*
 * 🔒 ROWS ARE DIVIDED; BLOCKS ARE NOT (23 Sep 2026, brief §0.5).
 *
 * Five operator screens drew the same list five ways — 4px gaps on Today, 12px
 * on The Month, 8px on Onboarding, a separate glass card per row on Expiries —
 * and the operator read the result as unfinished, which it was. A list is a
 * sequence of LIKE THINGS and needs rhythm; a block is still separated by
 * space.
 *
 * This is the rule as a test, because a convention applied by hand is a
 * convention until somebody adds the sixth list.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

/** Every operator-level list, and the file that draws it. */
const LISTS: Record<string, string> = {
  'Today': '../src/components/today/today.module.css',
  'The Month': '../src/components/month/month.module.css',
  'Onboarding': '../src/components/onboarding/onboarding.module.css',
  'Expiries': '../src/components/expiries/expiries.module.css',
  'Clients': '../src/components/clients/clients.module.css',
  'Infrastructure': '../src/components/infrastructure/infrastructure.module.css',
}

test('🔒 every operator list divides its rows with the hairline, and never above the first', () => {
  for (const [screen, rel] of Object.entries(LISTS)) {
    const css = read(rel)
    assert.match(css, /border-top: 1px solid var\(--edge\)/, `${screen} draws a list with no divider between its rows`)
    assert.match(css, /:first-child \{ border-top: 0/, `${screen} draws a rule above its first row`)
  }
})

test('🔒 the divider is --edge: --edge-2 is the border of a pressable thing', () => {
  for (const [screen, rel] of Object.entries(LISTS)) {
    const css = read(rel)
    const dividers = [...css.matchAll(/border-top: 1px solid var\((--edge[-2]*)\)/g)].map((m) => m[1])
    assert.ok(dividers.length > 0, `${screen} has no divider at all`)
    for (const d of dividers) assert.equal(d, '--edge', `${screen} divides rows with ${d}`)
  }
})

test('🔒 a list is not a stack of cards: one container, not a glass box per row', () => {
  /*
   * Expiries drew each row as its own glass card, which reads as a pile of
   * unrelated things rather than one list of comparable ones. The container
   * carries the surface; the rows carry only the divider.
   */
  const css = read('../src/components/expiries/expiries.module.css')
  const row = css.slice(css.indexOf('.row {'), css.indexOf('.row {') + 300)
  assert.doesNotMatch(row, /background: var\(--glass\)/, 'a row must not be its own card')
  assert.match(css, /\.rows \{[^}]*background: var\(--glass\)/s, 'the list itself is the surface')
})

test('🔒 the rule is written where the next person looks: in the brief, and in each file', () => {
  const brief = readFileSync(new URL('../../docs/cockpit-design-brief.md', import.meta.url), 'utf8')
  assert.match(brief, /Rows are divided; blocks are not/)
  assert.match(brief, /never above the first/)
  // 🔒 And it says it REFINES rather than reverses, because three files said
  // "never by stacked rules" and the code must not contradict itself.
  assert.match(brief, /refines that rule rather than reversing it/i)
  for (const rel of ['../src/components/today/today.module.css', '../src/components/month/month.module.css', '../src/components/onboarding/onboarding.module.css']) {
    assert.match(read(rel), /THE DIVIDER RULE/, `${rel} still claims rows are separated only by space`)
  }
})
