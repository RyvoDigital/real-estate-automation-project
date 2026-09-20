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
 * 🔒 WHY A HEAD REQUEST AND NOT router.refresh() ALONE. `refresh()` does not
 * report failure: a dead connection and a successful re-render are the same
 * return value, so a page driven by it would keep ticking confidently over a
 * server it can no longer reach. The HEAD is what makes the failure
 * observable, and the refresh is what makes the success useful.
 */

type Freshness = {
  /** The clock everything reads. It stops advancing when `stale` is true. */
  now: number
  stale: boolean
  /** When the last successful read landed. */
  lastGoodAt: number
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
  const [state, setState] = useState<Freshness>({ now: serverNow, stale: false, lastGoodAt: serverNow })
  const stale = useRef(false)
  const router = useRouter()

  useEffect(() => {
    const tick = setInterval(() => {
      // 🔒 The one line that makes motion mean something: while stale, `now`
      // is not advanced, so every clock derived from it stops where it was.
      if (stale.current) return
      setState((s) => ({ ...s, now: Date.now() }))
    }, TICK_MS)

    const reread = setInterval(async () => {
      try {
        const res = await fetch(window.location.href, { method: 'HEAD', cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))
        stale.current = false
        setState({ now: Date.now(), stale: false, lastGoodAt: Date.now() })
        router.refresh()
      } catch {
        stale.current = true
        setState((s) => ({ ...s, stale: true }))
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
