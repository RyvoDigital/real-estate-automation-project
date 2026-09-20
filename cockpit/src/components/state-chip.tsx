import styles from './state-chip.module.css'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A STATE IS RENDERED BY ASKING FOR THE STATE, NEVER BY ASKING FOR THE COLOUR.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Brief §0.5. This component and the clock are the only two things in the
 * cockpit that may reference `--through`, `--held`, `--clock`, `--red` or
 * `--handled`, and tests/tokens.test.ts fails the build if anything else does.
 *
 * That constraint is the mechanism rather than the decoration: a screen cannot
 * reach for green because green looked right, because it has no way to name
 * green. It can only say what is true — *this went through*, *a rule held this
 * back* — and the colour follows from the meaning.
 *
 * 🔒 Every chip carries a word AND a shape as well as a colour. The shape is
 * not ornament: a filled disc, a hollow ring, a barred ring and a dashed ring
 * are four states in greyscale, in a print-out, and to a reader who does not
 * separate red from green.
 */

export type Meaning =
  /** Went through, or is in force. */
  | 'through'
  /** A rule held it back — a decision, not an error. */
  | 'held'
  /** A clock is the reason. */
  | 'clock'
  /** Broken, or past its limit. */
  | 'red'
  /** Replied outside the cockpit. handledElsewhere, and nothing else. */
  | 'handled'
  /** Uncertainty, absence, sequence. Never coloured. */
  | 'grey'

/** The shape half. One per meaning, distinguishable without colour. */
function Mark({ meaning }: { meaning: Meaning }) {
  const common = { className: styles.mark, width: 11, height: 11, viewBox: '0 0 12 12', 'aria-hidden': true } as const
  switch (meaning) {
    case 'through':
      return <svg {...common}><circle cx="6" cy="6" r="4.6" fill="currentColor" /></svg>
    case 'handled':
      // A filled disc like `through`, but violet and with a bite out of it —
      // it went out, and not from here.
      return (
        <svg {...common}>
          <path d="M6 1.4a4.6 4.6 0 1 0 4.6 4.6H6Z" fill="currentColor" />
          <circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      )
    case 'held':
      // A ring with a bar across it: something is in the way, deliberately.
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M3.2 6h5.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      )
    case 'clock':
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="4.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M6 3.4v2.8l1.8 1.1" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      )
    case 'red':
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="4.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M6 3.5v3M6 8.3v.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )
    case 'grey':
      // Dashed, because it has no edges we can vouch for.
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="1.9 1.7" />
        </svg>
      )
  }
}

export function StateChip({ meaning, children }: { meaning: Meaning; children: React.ReactNode }) {
  return (
    <span className={`${styles.chip} ${styles[meaning]}`}>
      <Mark meaning={meaning} />
      {children}
    </span>
  )
}

/**
 * The mark alone, for where a state rides another element — the severity badge
 * on a client's mark, for instance. Same meaning, same shape, no chip.
 */
export function StateMark({ meaning, label }: { meaning: Meaning; label: string }) {
  return (
    <span className={`${styles.bare} ${styles[meaning]}`} role="img" aria-label={label}>
      <Mark meaning={meaning} />
    </span>
  )
}

/**
 * A surface that carries a state: a banner, a tray.
 *
 * 🔒 THIS EXISTS BECAUSE THE GUARD CAUGHT THE FIRST REAL SCREEN. The
 * escalations page reached for `--red-ground`, `--through-ground` and
 * `--handled-ground` directly, which is exactly the erosion tokens.css rule 3
 * exists to stop — and the right answer was not to add the screen to the
 * owners list. It was to give it a way to say what it means.
 */
export function StateSurface({
  meaning,
  className,
  children,
}: {
  meaning: Meaning
  className?: string
  children: React.ReactNode
}) {
  return <div className={`${styles.surface} ${styles[meaning]} ${className ?? ''}`}>{children}</div>
}
