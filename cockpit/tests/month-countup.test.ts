import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DURATION_MS, shouldAnimate, valueAt } from '../src/lib/month/countup'

/*
 * The count-up after a save (brief §1.14, 22 Sep 2026): only on a change of a
 * value already shown, never on load, never under reduced motion; ~500 ms;
 * the exact final value for assistive technology from the first frame.
 */

test('🔒 never on load: a first render has no previous value, so nothing moves', () => {
  assert.equal(shouldAnimate(undefined, 599, false), false)
})
test('only a real change moves, and never under prefers-reduced-motion', () => {
  assert.equal(shouldAnimate(0, 599, false), true)
  assert.equal(shouldAnimate(599, 599, false), false)
  assert.equal(shouldAnimate(0, 599, true), false)
})
test('about 500 ms, easing out, whole cents, and exactly the final value at the end', () => {
  assert.equal(DURATION_MS, 500)
  assert.equal(valueAt(0, 599, 0), 0)
  assert.equal(valueAt(0, 599, 1), 599)
  assert.equal(valueAt(0, 599, 1.7), 599)
  const mid = valueAt(0, 599, 0.5)
  assert.ok(mid > 599 / 2 && mid < 599, `ease-out passes the midpoint early: ${mid}`) // 1-(0.5)^3 = 0.875
  assert.ok(Number.isInteger(valueAt(-599, 12345, 0.33)))
})
test('🔒 the exact final value is in the accessible text from the first frame; the moving digits are hidden', () => {
  const src = readFileSync(new URL('../src/components/month/CountUp.tsx', import.meta.url), 'utf8')
  assert.match(src, /className=\{styles\.srOnly\}>\{eur\(cents\)\}/) // the prop, never the tweened value
  assert.match(src, /<span aria-hidden="true">/)
})
