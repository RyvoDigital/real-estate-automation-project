/*
 * The count-up's rules, pure (brief §1.14, 22 Sep 2026). The component is
 * components/month/CountUp.tsx; these are kept apart so the rules are tested
 * without a stylesheet.
 */

export const DURATION_MS = 500

/** Animate only a real change of a value already shown, and never when motion is reduced. */
export function shouldAnimate(prev: number | undefined, next: number, reducedMotion: boolean): boolean {
  return prev !== undefined && prev !== next && !reducedMotion
}

/** Ease-out cubic: fast at first, settling at the end. Exact at t = 1. */
export function valueAt(from: number, to: number, t: number): number {
  if (t >= 1) return to
  const e = 1 - Math.pow(1 - Math.max(0, t), 3)
  return Math.round(from + (to - from) * e)
}
