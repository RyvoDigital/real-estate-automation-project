/*
 * THE COCKPIT'S MOTION, AS RULES (23 Sep 2026). Brief §1.14 and §0.5.
 *
 * The durations and the curve live in tokens.css; this module is the part that
 * can be tested without a stylesheet, the same split as lib/month/countup.ts.
 *
 * ── The one rule ────────────────────────────────────────────────────────────
 *   🔒 MOTION ENCODES A CHANGE IN STATE OR IN TIME. Nothing moves for any
 *      other reason (§1.14, operator, 19 Sep 2026).
 *
 * ── And the six it implies ──────────────────────────────────────────────────
 *   A. Liveness is the only thing that loops — the clocks tick and the stamp
 *      pulses while reads land, and both stop when they stop. One ambient
 *      animation in the cockpit, and it owns the live/frozen state (§0.5).
 *   B. A save is acknowledged: the figure counts up, the row you recorded is
 *      marked, a confirmation's ground fades in.
 *   C. What can be pressed answers the pointer.
 *   D. What opens, opens — and closes the same way, without overshoot.
 *   E. A menu arrives rather than appearing.
 *   F. 🔴 A LOUD STATE NEVER ANIMATES ITS ENTRANCE. Red, stale, failed, run
 *      out: full strength, first frame. A fade on bad news is a softening of
 *      it, and the operator reads this screen to find bad news.
 *   G. 🔴 MOTION ONLY EVER BEGINS FROM SOMETHING THE OPERATOR DID. A render
 *      that arrives on its own — the 60-second re-read, a slow first paint, a
 *      streamed boundary — never animates. Otherwise motion arrives in the
 *      middle of reading, which is the thing every rule above is avoiding.
 *
 * ── What never moves ────────────────────────────────────────────────────────
 *   No entrance choreography on a routine load. No looping or ambient
 *   animation beyond A. Nothing moves to draw the eye to a row: urgency is in
 *   the clock and the group order, and a moving row among still ones is a sort
 *   by animation.
 *
 * ── prefers-reduced-motion ──────────────────────────────────────────────────
 *   Every transition off, everywhere, with no exception. The clocks still
 *   update as plain text: the liveness signal survives without animation
 *   because the stamp says it in words.
 */

/** The three speeds, mirrored from tokens.css for the JS that needs them. */
export const MOTION = {
  /** the answer to a press */
  press: 100,
  /** the answer to a pointer — hover, and a menu arriving */
  quick: 120,
  /** a thing opening or closing */
  open: 200,
} as const

/**
 * 🔴 The states that never animate their entrance (Rule F). These are the
 * meanings a screen uses to say something is wrong or is not current; an
 * animation on any of them delays the reading of bad news by exactly its own
 * duration.
 */
export const LOUD = ['red', 'clock'] as const
export type Loud = (typeof LOUD)[number]

/** Does this state-chip meaning carry bad news or a clock running out? */
export function isLoud(meaning: string): boolean {
  return (LOUD as readonly string[]).includes(meaning)
}

/**
 * May this moment animate at all?
 *
 * 🔒 Three questions, in the order they matter: is motion wanted by the person
 * (reduced), did the person cause this render (Rule G), and is the thing being
 * animated loud (Rule F).
 */
export function mayAnimate(opts: { reducedMotion: boolean; operatorCaused: boolean; loud?: boolean }): boolean {
  if (opts.reducedMotion) return false
  if (!opts.operatorCaused) return false
  if (opts.loud) return false
  return true
}

/**
 * A mark that begins on page load — the row you just recorded — HOLDS before
 * it fades, and never fades in.
 *
 * 🔒 The reason is the slow connection: if the page arrives late, a mark that
 * had already started fading would be gone by the time it was read. A hold
 * survives a slow arrival; a fade-in wastes its own duration.
 */
export const MARK = {
  /** the whole life of the mark */
  totalMs: 2200,
  /** the fraction of it spent at full strength before releasing */
  holdFraction: 0.65,
} as const

export function markHoldsUntilMs(): number {
  return Math.round(MARK.totalMs * MARK.holdFraction)
}
