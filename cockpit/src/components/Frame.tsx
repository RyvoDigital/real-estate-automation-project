import Link from 'next/link'
import { frameSide, type FrameMode } from '@/lib/frame'
import { badge, type CountsOrUnknown } from '@/lib/counts'
import styles from './Frame.module.css'

/**
 * The cockpit's one frame. Brief I §0.1 D1/D3, brief II §2.
 *
 * 🔒 IT COUNTS NOTHING. The `counts` prop is read once per request by the
 * layout and handed down. The frame renders a number it was given, and
 * `badge()` is the only formatter, so the sidebar and the page it links to
 * cannot format the same figure differently — the defect that made a nav say 4
 * beside a page saying 5, twice.
 *
 * 🔴 IT HAS NO PRESENTED VARIANT. `frameSide(mode)` decides what is missing,
 * and asking it for a presented render of a screen that refuses presentation
 * throws rather than falling back. Four Stage B screens were each independently
 * drawn with no sidebar at all; one function with a mode is why that cannot
 * happen again.
 */
export function Frame({
  mode,
  client,
  current,
  counts,
  operatorEmail,
  children,
}: {
  mode: FrameMode
  client?: { id: string; name: string }
  /** The slug of the screen being rendered. '' is a landing. */
  current?: string
  /** Read once, by the layout. Null when the read failed — never zero. */
  counts: CountsOrUnknown
  operatorEmail: string
  children: React.ReactNode
}) {
  const side = frameSide(mode, { client, current })
  const waiting = side.showsCounts ? badge(counts) : ''

  return (
    <div className={styles.app}>
      <aside className={styles.side}>
        <div className={styles.brand}>Ryvo</div>

        {side.marker && <span className={styles.marker}>{side.marker}</span>}

        {side.up && (
          <Link className={styles.up} href={side.up.href}>
            <span>‹ {side.up.label}</span>
            {/* An empty badge renders nothing rather than a zero, and a failed
                read renders a dash. Both come from badge(). */}
            {waiting && <span className={styles.upCount}>{waiting} waiting</span>}
          </Link>
        )}

        {side.switcher &&
          (side.switcher.pressable ? (
            <button type="button" className={styles.switcher} aria-haspopup="menu">
              <span className={styles.switcherName}>{side.switcher.name}</span>
            </button>
          ) : (
            // 🔒 Not a disabled button. A greyed control still reads as one
            // click from opening, and what must not exist here is the control
            // itself (§0.4-7).
            <div className={styles.still}>
              <span className={styles.switcherName}>{side.switcher.name}</span>
            </div>
          ))}

        <nav className={styles.nav} aria-label={mode === 'presented' ? 'Esta reunião' : 'Sections'}>
          <span className={styles.navLabel}>
            {mode === 'presented' ? 'Esta reunião' : mode === 'client' ? 'This client' : 'Ryvo'}
          </span>
          {side.items.map((item) => (
            <Link
              key={item.slug}
              className={styles.item}
              href={item.href}
              aria-current={item.slug === current ? 'page' : undefined}
            >
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className={styles.foot}>{operatorEmail} · Europe/Lisbon</div>
      </aside>

      <main className={styles.main}>{children}</main>
    </div>
  )
}
