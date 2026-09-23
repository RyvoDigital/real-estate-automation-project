/*
 * 🔴 THE GAP THAT WAS NOT THERE (23 Sep 2026).
 *
 * "What this page does not do" sat flush on "Record a contract" because `.desk`
 * had no layout above 760px. The fix gave it `gap: var(--s7)` — and the gap was
 * STILL zero, because the --s1…--s7 scale is declared on `.page`, which is
 * `.desk`'s CHILD. Custom properties inherit downward, so the value did not
 * exist here, `gap` was invalid, and the collision stayed behind a new hairline
 * that made it look fixed.
 *
 * The screenshot did not show it. Measuring the two boxes in a browser did.
 * This test holds the mechanism: any element that uses the scale must declare
 * it or inherit it from an ancestor that does.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const CSS = readFileSync(new URL('../src/components/month/month.module.css', import.meta.url), 'utf8')

/** The rule block for a selector, as written. */
const ruleFor = (selector: string) => {
  const i = CSS.indexOf(`${selector} {`)
  assert.ok(i >= 0, `${selector} is gone from month.module.css`)
  return CSS.slice(i, CSS.indexOf('}', i) + 1)
}

test('🔴 .desk separates the page from the forms, with a gap that actually resolves', () => {
  const desk = ruleFor('.desk')
  assert.match(desk, /display: flex/)
  assert.match(desk, /gap: var\(--s7\)/)
  // 🔒 The scale must be declared HERE: .page is a child, and a child's
  // custom properties are invisible to its parent.
  assert.match(desk, /--s7:\s*\d+px/, '.desk uses --s7 without declaring it, so the gap is invalid and reads as zero')
})

test('🔒 every element that uses the scale can see it', () => {
  /*
   * The general form of the same mistake. For each rule that reads a --sN
   * value, either that rule declares the scale, or it is inside .page (which
   * does). .desk is the only element in this file outside .page.
   */
  const rules = [...CSS.matchAll(/^(\.[A-Za-z][\w-]*)\s*\{([^}]*)\}/gm)]
  const declaresScale = (body: string) => /--s\d:\s*\d+px/.test(body)
  const page = rules.find((r) => r[1] === '.page')
  assert.ok(page && declaresScale(page[2]), '.page must declare the scale the rest of the file reads')

  for (const [, selector, body] of rules) {
    if (!/var\(--s\d\)/.test(body)) continue
    if (selector === '.desk') {
      assert.ok(declaresScale(body), '.desk is outside .page, so it must declare the scale it uses')
    }
  }
})

test('🔒 the phone still refuses The Month: .desk is hidden below 761px, and that rule comes last', () => {
  const hide = CSS.lastIndexOf('.desk { display: none; }')
  const show = CSS.indexOf('.desk { --s7')
  assert.ok(hide > show, 'the phone rule must come after the desk layout, or the refusal stops working')
})
