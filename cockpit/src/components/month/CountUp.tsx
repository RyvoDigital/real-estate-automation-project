'use client'

import { useEffect, useRef, useState } from 'react'
import { eur } from '@/lib/month/model'
import { DURATION_MS, shouldAnimate, valueAt } from '@/lib/month/countup'
import styles from './month.module.css'

/*
 * A figure that counts up to its new value after a save. Brief §1.14 (added
 * 22 Sep 2026, operator): about 500 ms, only on a change that FOLLOWS a save,
 * never on load; the exact final value is in the accessible text from the
 * first frame; off under prefers-reduced-motion.
 *
 * "Only after a save" holds by construction on The Month: the only in-place
 * re-render of the page is the one a save's action returns (revalidatePath).
 * Moving between months is a plain link, a fresh load, and a fresh load mounts
 * this with no previous value, so it starts at the final one and nothing moves.
 */

export function CountUp({ cents, per }: { cents: number; per?: string }) {
  const [shown, setShown] = useState(cents)
  const prev = useRef<number | undefined>(undefined)

  useEffect(() => {
    const from = prev.current
    prev.current = cents
    const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!shouldAnimate(from, cents, reduced)) {
      setShown(cents)
      return
    }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = (now - start) / DURATION_MS
      setShown(valueAt(from as number, cents, t))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [cents])

  const s = eur(shown)
  const k = s.lastIndexOf(',')
  return (
    <span className={styles.money}>
      {/* the exact final value, for assistive technology, from the first frame */}
      <span className={styles.srOnly}>{eur(cents)}{per ? ` ${per}` : ''}</span>
      <span aria-hidden="true">
        {s.slice(0, k)}<span className={styles.cents}>{s.slice(k)}</span>
        {per ? <span className={styles.per}>{per}</span> : null}
      </span>
    </span>
  )
}
