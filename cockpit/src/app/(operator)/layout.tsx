import { headers } from 'next/headers'
import { requireOperator } from '@/lib/auth'
import { SCREEN_HEADER } from '@/lib/frame'
import { Frame } from '@/components/Frame'

/**
 * THE OPERATOR FRAME. Every top-level screen renders inside this (23 Sep 2026).
 *
 * 🔴 WHY IT EXISTS: THE CHROME IS NOT PART OF WHAT A NAVIGATION REPLACES.
 * Until now each of the six operator pages rendered <Frame> itself, so the
 * chrome was BELOW any loading boundary and a boundary repainted the whole
 * viewport — sidebar and content together. Measured against production on
 * 23 Sep, the routes with a boundary flushed a shell in 120–185ms and streamed
 * the body in behind it; the five without one sent nothing at all until the
 * render finished, up to 1018ms on /clients. Neither behaviour was right:
 * holding the old screen says nothing happened, and blanking the frame throws
 * away the part that never changes.
 *
 * With the frame here, `loading.tsx` sits BELOW it and covers <main> alone.
 * The sidebar is rendered once and then simply persists: on a client
 * navigation React does not re-render a layout that has not changed.
 *
 *   🔒 THE COUNTS ARE NOT READ HERE, and that is not an oversight. The badge
 *      renders in exactly one element — the "‹ way up" link — and the operator
 *      frame has no way up, because it is the top. `frameSide('operator')` now
 *      says `showsCounts: false` to match. Six requests per navigation went to
 *      a number that was computed and discarded.
 *   🔒 requireOperator() STAYS IN THE PAGES TOO. This is the layout that
 *      guarantees the gate runs for the group, but the pages keep their own
 *      call: src/proxy.ts is explicit that it is not the security boundary,
 *      and neither is a layout that a future route could be added beside.
 *      Stage 2 makes the second call free by wrapping it in cache().
 */
export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  const [operator, screen] = await Promise.all([
    requireOperator(),
    // Cosmetic only — which nav item is bold. Set by src/proxy.ts.
    headers().then((h) => h.get(SCREEN_HEADER) ?? ''),
  ])

  return (
    <Frame mode="operator" current={screen} counts={null} operatorEmail={operator.email}>
      {children}
    </Frame>
  )
}
