'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * TICKING IS THE FRESHNESS SIGNAL.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Brief §1.14, and the rule the operator called the best idea in its batch:
 * a relative clock that keeps counting over a failed read is a figure computed
 * at a moment presented as now — the forecast's defect, in motion.
 *
 * So the motion IS the claim. While the page can still reach the server, every
 * clock advances and the stamp says `Live`. When a re-read fails, the clocks
 * FREEZE at their last value, go dim, and the stamp turns amber carrying the
 * age of the last successful read. Nothing is greyed out, nothing is hidden,
 * and no number is quietly refreshed — the reader can see that time has
 * stopped, which is the honest report of a page that no longer knows.
 *
 * 🔒 WHY A SEPARATE REQUEST AND NOT router.refresh() ALONE. `refresh()` does
 * not report failure: a dead connection and a successful re-render are the
 * same return value, so a page driven by it would keep ticking confidently
 * over a server it can no longer reach. The ask is what makes the failure
 * observable, and the refresh is what makes the success useful.
 *
 * 🔴 WHAT IT ASKS, AND WHY IT CHANGED (23 Sep 2026). It used to HEAD the page's
 * own URL, which on a force-dynamic route runs the whole render and discards
 * it — a second complete render of Today every minute for every open tab. It
 * now asks /api/alive, which verifies the session and reads nothing. That is
 * also a better answer: a HEAD followed the proxy's redirect to /login and came
 * back 200, so an EXPIRED session reported itself live.
 */

type Freshness = {
  /** The clock the DATA reads. It stops advancing when `stale` is true. */
  now: number
  stale: boolean
  /** When the last successful read landed. */
  lastGoodAt: number
  /**
   * 🔴 The wall clock, which NEVER stops.
   *
   * The data's clock freezes because the data stopped arriving. The age of
   * that failure is a different fact, and it keeps growing whether we can
   * reach the server or not — so the stamp reads this one.
   *
   * Found on the first live check, 20 Sep 2026: the stamp said "1 min ago"
   * two minutes into an outage, because it was derived from the same frozen
   * clock as the rows. A stale page under-reporting its own staleness is the
   * defect this whole mechanism exists to prevent, arriving inside the fix.
   */
  wallNow: number
}

const LiveContext = createContext<Freshness | null>(null)

/** How often the displayed minute counts are recomputed. */
const TICK_MS = 15_000
/** How often the server is asked whether it is still there. §1.12: 60s. */
const REREAD_MS = 60_000

export function Live({ serverNow, children }: { serverNow: number; children: React.ReactNode }) {
  // Seeded from the server's clock so the first paint matches the markup the
  // server sent, and only then does it become live. Otherwise every clock
  // hydrates with a different value than it rendered with.
  const [state, setState] = useState<Freshness>({
    now: serverNow,
    stale: false,
    lastGoodAt: serverNow,
    wallNow: serverNow,
  })
  const stale = useRef(false)
  const router = useRouter()

  useEffect(() => {
    const tick = setInterval(() => {
      // 🔒 The two lines that make motion mean something. `wallNow` always
      // advances, so the stamp can age. `now` advances only while the reads
      // are landing, so every clock derived from it stops where it was.
      const at = Date.now()
      setState((s) => (stale.current ? { ...s, wallNow: at } : { ...s, now: at, wallNow: at }))
    }, TICK_MS)

    const reread = setInterval(async () => {
      try {
        /*
         * 🔴 A ROUTE THAT ANSWERS THE QUESTION, not the whole page again.
         * This was `fetch(window.location.href, { method: 'HEAD' })`, and every
         * cockpit page is force-dynamic — Next runs the entire render for a
         * HEAD and throws the body away. So the liveness check was a second
         * full render of Today every minute, per open tab, on top of the
         * refresh below. /api/alive verifies the session and reads nothing.
         */
        const res = await fetch('/api/alive', { cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))
        stale.current = false
        const at = Date.now()
        setState({ now: at, stale: false, lastGoodAt: at, wallNow: at })
        router.refresh()
      } catch {
        stale.current = true
        setState((s) => ({ ...s, stale: true, wallNow: Date.now() }))
      }
    }, REREAD_MS)

    return () => {
      clearInterval(tick)
      clearInterval(reread)
    }
  }, [router])

  return <LiveContext.Provider value={state}>{children}</LiveContext.Provider>
}

/**
 * Read the shared clock. Outside a <Live>, returns null — a component then
 * renders what the server gave it and never pretends to be live.
 */
export function useFreshness(): Freshness | null {
  return useContext(LiveContext)
}
