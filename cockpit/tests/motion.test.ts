/*
 * 🔴 THE MOTION CONTRACT, AS A GUARD (23 Sep 2026).
 *
 * §1.14 has said since 19 September that motion encodes a change in state or
 * in time and that nothing loops — and by 23 September the code had two
 * shimmering skeletons, one of which I wrote the day before, reasoning from
 * the stamp's licensed pulse. A contract enforced by comment drifts; this is
 * the same contract enforced by the suite.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { MOTION, MARK, isLoud, mayAnimate, markHoldsUntilMs } from '../src/lib/motion'

const SRC = new URL('../src/', import.meta.url).pathname

function sheets(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) sheets(p, out)
    else if (p.endsWith('.css')) out.push(p)
  }
  return out
}
const CSS = sheets(SRC).map((p) => ({ rel: relative(SRC, p), text: readFileSync(p, 'utf8') }))

test('🔴 ONE AMBIENT LOOP, and it belongs to the stamp', () => {
  /*
   * §1.14: "No looping or ambient animation. No pulsing dots, shimmering
   * skeletons, or animated gradients." §0.5 licenses exactly one exception —
   * the stamp — because the stamp owns the live/frozen state and the pulse IS
   * that claim.
   */
  const loops: string[] = []
  for (const { rel, text } of CSS) {
    for (const m of text.matchAll(/animation:[^;]*\binfinite\b[^;]*;/g)) {
      if (rel === 'components/stamp.module.css') continue
      loops.push(`${rel}: ${m[0].trim()}`)
    }
  }
  assert.deepEqual(loops, [], `an ambient loop outside the stamp:\n  ${loops.join('\n  ')}`)

  // And the licensed one is still there: the rule is an exception, not a ban.
  const stamp = CSS.find((c) => c.rel === 'components/stamp.module.css')!
  assert.match(stamp.text, /animation: breathe 2s ease-in-out infinite/)
})

test('🔒 every keyframe animation can be turned off, in its own file', () => {
  const missing: string[] = []
  for (const { rel, text } of CSS) {
    if (!/@keyframes/.test(text)) continue
    if (!/prefers-reduced-motion/.test(text)) missing.push(rel)
  }
  assert.deepEqual(missing, [], `these animate with no way to stop:\n  ${missing.join('\n  ')}`)
})

test('🔒 every transition can be turned off too', () => {
  const missing: string[] = []
  for (const { rel, text } of CSS) {
    if (!/\btransition:/.test(text)) continue
    if (!/prefers-reduced-motion/.test(text)) missing.push(rel)
  }
  assert.deepEqual(missing, [], `these transition with no way to stop:\n  ${missing.join('\n  ')}`)
})

test('🔒 the vocabulary is the tokens: no new duration literal outside tokens.css', () => {
  /*
   * Nine durations and four easings had each been chosen at their own call
   * site before this. The legacy sheet keeps its own until it is retired.
   */
  const LEGACY = ['app/globals.css']
  const offences: string[] = []
  for (const { rel, text } of CSS) {
    if (rel === 'app/tokens.css' || LEGACY.includes(rel)) continue
    for (const m of text.matchAll(/(transition|animation)[^;]*?([\d.]+m?s)\b[^;]*;/g)) {
      /*
       * Two durations are allowed to be literal, and each owns a fact rather
       * than a feel: the mark's whole life (lib/motion.ts MARK.totalMs, held to
       * a number by its own test) and the stamp's licensed breath.
       */
      if (rel === 'components/expiries/expiries.module.css' && m[2] === '2.2s') continue
      if (rel === 'components/stamp.module.css' && m[2] === '2s') continue
      offences.push(`${rel}: ${m[0].trim()}`)
    }
  }
  assert.deepEqual(offences, [], `a duration written by hand instead of taken from tokens.css:\n  ${offences.join('\n  ')}`)
})

test('🔴 RULE F: a loud state never animates its entrance', () => {
  assert.equal(isLoud('red'), true)
  assert.equal(isLoud('clock'), true)
  assert.equal(isLoud('through'), false)
  assert.equal(isLoud('grey'), false)
  assert.equal(mayAnimate({ reducedMotion: false, operatorCaused: true, loud: true }), false)

  // And on the screen: the confirmation's ground fades, the red banner does not.
  const expiries = CSS.find((c) => c.rel === 'components/expiries/expiries.module.css')!.text
  const banner = expiries.slice(expiries.indexOf('.banner {'), expiries.indexOf('.banner {') + 200)
  assert.doesNotMatch(banner, /animation:/, 'the banner class is used by refusals too — it must not animate')
})

test('🔴 RULE G: motion only ever begins from something the operator did', () => {
  assert.equal(mayAnimate({ reducedMotion: false, operatorCaused: false }), false, 'a render nobody asked for must not animate')
  assert.equal(mayAnimate({ reducedMotion: true, operatorCaused: true }), false)
  assert.equal(mayAnimate({ reducedMotion: false, operatorCaused: true }), true)

  /*
   * The 60-second re-read (Live.tsx) replaces whole lists on Today, the client
   * landing and escalations. It must stay silent, or motion arrives in the
   * middle of reading.
   */
  const live = readFileSync(new URL('../src/components/Live.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(live, /animate|transition|keyframes/i, 'the background re-read must not animate anything')
})

test('🔒 a mark that begins on load HOLDS before it releases, so a slow page still shows it', () => {
  assert.equal(MARK.totalMs, 2200)
  assert.ok(MARK.holdFraction >= 0.5, 'less than half a hold is a fade, and a fade is gone before a slow page settles')
  assert.equal(markHoldsUntilMs(), 1430)

  const expiries = CSS.find((c) => c.rel === 'components/expiries/expiries.module.css')!.text
  const frames = expiries.slice(expiries.indexOf('@keyframes recorded'), expiries.indexOf('@keyframes recorded') + 400)
  // Full strength at 0% AND at the hold point: it never fades in.
  assert.match(frames, /0%\s*\{[^}]*--lift-3/)
  assert.match(frames, /65%\s*\{[^}]*--lift-3/)
})

test('🔒 the three speeds, and one curve that does not overshoot', () => {
  const tokens = CSS.find((c) => c.rel === 'app/tokens.css')!.text
  assert.match(tokens, new RegExp(`--motion-press: ${MOTION.press}ms`))
  assert.match(tokens, new RegExp(`--motion-quick: ${MOTION.quick}ms`))
  assert.match(tokens, new RegExp(`--motion: ${MOTION.open}ms`))
  // 🔴 No overshoot: both control points stay within 0..1 on the value axis.
  const curve = /--ease-out: cubic-bezier\(([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+)\)/.exec(tokens)
  assert.ok(curve, 'the one curve is missing')
  const [, , y1, , y2] = curve.map(Number)
  assert.ok(y1 <= 1 && y2 <= 1, `the curve overshoots (${y1}, ${y2}) — nothing in the cockpit bounces`)
})

test('🔒 the skeleton does not move: it is a block of the right shape', () => {
  // Was FrameSkeleton.module.css until 23 Sep 2026, when the frame moved into
  // a layout and the loading state stopped drawing chrome at all.
  const skeleton = CSS.find((c) => c.rel === 'components/PageSkeleton.module.css')!.text
  assert.doesNotMatch(skeleton, /animation:/, 'the loading skeleton pulses again')
  const globals = CSS.find((c) => c.rel === 'app/globals.css')!.text
  assert.doesNotMatch(globals, /@keyframes sheen/, 'the legacy shimmer is back')
})
