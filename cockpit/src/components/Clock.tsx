'use client'

import { formatWait, minutesSince, TIER_WORD, tierFor } from '@/lib/escalation'
import { useFreshness } from './Live'
import styles from './clock.module.css'

/**
 * A wait, and its tier as a position.
 *
 * 🔒 `tierFor` and `TIER_WORD` are imported, never re-implemented. Queue.tsx
 * used to carry its own `tierOf` with the same 30/90/240 thresholds written a
 * second time — dead code, and a second source for a number that decides when
 * a lead is a breach. Deleted in C3.
 *
 * 🔒 The full wait, in words, is `formatWait` — the same function the rest of
 * the cockpit uses — and it goes in the accessible name. The two-size display
 * is a typographic treatment of that one value, not a second formatting of it.
 */

/** The scale the track is drawn on. Breach at 240 sits at 80% of it. */
const SCALE_MINUTES = 300
const NOTCHES = [30, 90, 240]

export function Clock({
  at,
  /** Minutes as the server computed them, for the first paint. */
  serverMinutes,
  /** A clock measuring something other than a wait keeps its own word. */
  word,
  /**
   * 🔴 No tier. A clock that is not measuring a wait must not be graded like
   * one: the handled-elsewhere tray measures time since somebody replied, and
   * rendering that at tier 2 says "late" about a lead already dealt with.
   */
  untiered = false,
}: {
  at: string | null
  serverMinutes: number
  word?: string
  untiered?: boolean
}) {
  const fresh = useFreshness()
  // Before hydration, and outside a <Live>, the server's number is what shows.
  // While live, the shared clock drives it; while stale, that clock has stopped
  // and so has this.
  const minutes = fresh && at ? minutesSince(at, fresh.now) : serverMinutes

  const tier = untiered ? 0 : tierFor(minutes)
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  const pct = Math.min(100, Math.round((minutes / SCALE_MINUTES) * 100))
  const frozen = Boolean(fresh?.stale)

  return (
    <span
      className={`${styles.clock} ${untiered ? styles.untiered : styles[`t${tier}`]} ${frozen ? styles.frozen : ''}`}
      role="img"
      aria-label={
        untiered
          ? `${formatWait(minutes)} ${word ?? ''}${frozen ? ', frozen: the page has not been able to re-read' : ''}`
          : `waiting ${formatWait(minutes)} — ${TIER_WORD[tier]}${frozen ? ', frozen: the page has not been able to re-read' : ''}`
      }
    >
      <span className={styles.value}>
        {hours > 0 ? (
          <>
            {hours}h<span className={styles.minutes}>{String(mins).padStart(2, '0')}m</span>
          </>
        ) : (
          <>{mins}m</>
        )}
      </span>
      {/* No track either: a track with tier notches IS the grading. */}
      {!untiered && (
        <span className={styles.track}>
          <span className={styles.fill} style={{ width: `${pct}%` }} />
          {NOTCHES.map((n) => (
            <span key={n} className={styles.notch} style={{ left: `${(n / SCALE_MINUTES) * 100}%` }} />
          ))}
        </span>
      )}
      <span className={styles.word}>{word ?? TIER_WORD[tier]}</span>
    </span>
  )
}
