'use client'

import { useFreshness } from './Live'
import styles from './stamp.module.css'

/**
 * WHEN THIS PAGE LAST KNEW ANYTHING. Brief §0.4-6.
 *
 * Every figure computed at a moment says which moment. On a live screen the
 * moment is *now, still* — and the honest way to say that is to show the read
 * time and let the clocks move. When the re-read fails, this is the half that
 * explains why everything has gone still: it turns amber and carries the age
 * of the last successful read.
 *
 * 🔒 It never says "updated just now" while stale, and it never hides. A page
 * that stops reporting its own age at exactly the moment its age starts to
 * matter is the defect this exists to prevent.
 */
export function Stamp({ serverAt }: { serverAt: string }) {
  const fresh = useFreshness()
  const at = new Date(serverAt)
  const clock = at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  if (fresh?.stale) {
    // 🔴 From the WALL clock, not from the frozen one. The rows stop because
    // the data stopped; the age of that failure keeps growing regardless, and
    // a stale page that under-reports its own staleness is the defect this
    // mechanism exists to prevent.
    const minutes = Math.max(1, Math.floor((fresh.wallNow - fresh.lastGoodAt) / 60000))
    return (
      <span className={`${styles.stamp} ${styles.frozen}`}>
        <span>Last successful read</span>
        <b>
          {clock} — {minutes} min ago
        </b>
        <span>the clocks below are frozen at that moment</span>
      </span>
    )
  }

  return (
    <span className={styles.stamp}>
      <span>
        <span className={styles.pulse} aria-hidden />
        Live
      </span>
      <b>read {clock}</b>
      <span>re-read every 60s · the clocks tick while it succeeds</span>
    </span>
  )
}
