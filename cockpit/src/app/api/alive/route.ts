import { NextResponse } from 'next/server'

import { isAllowed } from '@/lib/auth'
import { authClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * 🔴 IS THE SERVER STILL THERE, AND AM I STILL SIGNED IN (Stage 2, 23 Sep 2026).
 *
 * components/Live.tsx asks this every 60 seconds so a screen can tell the
 * operator that time has stopped rather than quietly showing yesterday's
 * numbers as though they were current (§1.12).
 *
 * ── WHAT IT REPLACED, AND WHY THAT WAS WRONG ────────────────────────────────
 *
 * It used to be `fetch(window.location.href, { method: 'HEAD' })`. Every
 * cockpit page is `dynamic = 'force-dynamic'`, and Next does not short-circuit
 * a HEAD: it runs the WHOLE render and discards the body. So the liveness
 * check was a complete server render of Today — around 29 database requests,
 * plus six per client — thrown away, every minute, for every open tab. Paired
 * with the `router.refresh()` that follows it, each tab cost TWO full renders a
 * minute where one was wanted, and the wasted one was the more expensive habit
 * because nobody could see it.
 *
 * 🔒 IT ANSWERS BETTER, NOT JUST CHEAPER. The HEAD could not tell an expired
 * session from a healthy one: the proxy redirects a signed-out request to
 * /login, `fetch` follows the redirect, and a 200 comes back from the login
 * screen — so a page whose session had expired went on reporting itself live.
 * This returns 401 for that, which is the true answer.
 *
 * 🔒 IT READS NO DATA. One signature verification against a key set that is
 * already cached in the process. No client, no lead, no count — there is
 * nothing here for a slow query to be slow about.
 *
 * 🔒 IT IS PUBLIC IN THE PROXY and refuses here instead. A redirect to /login
 * would be indistinguishable from success once followed, which is the defect
 * above; src/proxy.ts lists it for exactly that reason.
 */
export async function GET() {
  const no = (status: number) => NextResponse.json({ alive: false }, { status, headers: { 'cache-control': 'no-store' } })
  try {
    const supabase = await authClient()
    const { data, error } = await supabase.auth.getClaims()
    const email = typeof data?.claims?.email === 'string' ? data.claims.email : undefined
    if (error || !email || !isAllowed(email)) return no(401)
    return NextResponse.json({ alive: true, at: new Date().toISOString() }, { headers: { 'cache-control': 'no-store' } })
  } catch {
    // The server answered, but could not establish who is asking. That is not
    // a live session, and saying so is the point of this route.
    return no(503)
  }
}
