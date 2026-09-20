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

/*
 * 🔴 A SECOND SCALE, BECAUSE A WAIT ON SOMEBODY ELSE IS NOT A LATE LEAD.
 *
 * The gate waits on the client landing run in WEEKS — Meta since 3 September,
 * the lawyer since 24 August. Drawn on the minute scale above, every one of
 * them pins at 100% and grades as a breach, so the screen would shout "breach"
 * about a thing that is behaving exactly as expected.
 *
 * The waiting room's own steps are 7 and 21 days (brief §1.12), so that is the
 * scale, on a 28-day track. It lives HERE rather than in a new component
 * because `Clock.tsx` and `state-chip.tsx` are the only two files allowed to
 * name a colour token, and `tests/tokens.test.ts` fails the build otherwise.
 */
const SCALE_DAYS = 28
const DAY_NOTCHES = [7, 21]

/** Days, floored — the same direction `wholeDaysUntil` rounds for date columns. */
function daysOf(minutes: number): number {
  return Math.floor(minutes / 1440)
}

/**
 * The step a wait has reached. Not a tier: it does not say "late", it says how
 * many of the waiting room's two steps this wait has passed.
 */
function stepOf(days: number): 0 | 1 | 2 {
  if (days >= 21) return 2
  if (days >= 7) return 1
  return 0
}

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
  /**
   * 🔴 `days` is for a wait on somebody outside — a gate, a waiting room —
   * where weeks are normal and a minute-scaled tier would read as a breach.
   */
  scale = 'wait',
}: {
  at: string | null
  serverMinutes: number
  word?: string
  untiered?: boolean
  scale?: 'wait' | 'days' | 'since'
}) {
  const fresh = useFreshness()
  // Before hydration, and outside a <Live>, the server's number is what shows.
  // While live, the shared clock drives it; while stale, that clock has stopped
  // and so has this.
  const minutes = fresh && at ? minutesSince(at, fresh.now) : serverMinutes

  const frozen = Boolean(fresh?.stale)

  /*
   * 🔴 HOW LONG AGO SOMETHING HAPPENED IS NOT A WAIT, AND NOT HANDLED-ELSEWHERE.
   *
   * The clocks strip says when each automation last ran. On the tiered scale a
   * healthy nightly automation reads as a breach every morning; on `untiered`
   * it would take the violet, which means handledElsewhere and nothing else.
   * Spending that meaning on "ran four hours ago" would cost the one colour
   * that currently says somebody else already dealt with this.
   *
   * So: no tier, no track, no semantic colour. An elapsed time and nothing more.
   */
  if (scale === 'since') {
    return (
      <span
        className={`${styles.clock} ${styles.since} ${frozen ? styles.frozen : ''}`}
        role="img"
        aria-label={`${formatWait(minutes)} ago${word ? ` — ${word}` : ''}${
          frozen ? ', frozen: the page has not been able to re-read' : ''
        }`}
      >
        <span className={styles.value}>{formatWait(minutes)}</span>
        <span className={styles.word}>{word ?? 'ago'}</span>
      </span>
    )
  }

  if (scale === 'days') {
    const days = daysOf(minutes)
    const step = stepOf(days)
    const dayPct = Math.min(100, Math.round((days / SCALE_DAYS) * 100))
    const spoken = days === 0 ? 'less than a day' : `${days} day${days === 1 ? '' : 's'}`
    return (
      <span
        className={`${styles.clock} ${styles[`d${step}`]} ${frozen ? styles.frozen : ''}`}
        role="img"
        aria-label={`waiting ${spoken}${word ? ` ${word}` : ''}${
          frozen ? ', frozen: the page has not been able to re-read' : ''
        }`}
      >
        <span className={styles.value}>
          {days}
          <span className={styles.minutes}>d</span>
        </span>
        <span className={styles.track}>
          <span className={styles.fill} style={{ width: `${dayPct}%` }} />
          {DAY_NOTCHES.map((n) => (
            <span key={n} className={styles.notch} style={{ left: `${(n / SCALE_DAYS) * 100}%` }} />
          ))}
        </span>
        <span className={styles.word}>{word ?? ''}</span>
      </span>
    )
  }

  const tier = untiered ? 0 : tierFor(minutes)
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  const pct = Math.min(100, Math.round((minutes / SCALE_MINUTES) * 100))

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
