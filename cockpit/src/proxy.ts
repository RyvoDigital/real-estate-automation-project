import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { CLIENT_SCREENS, SCREEN_HEADER, operatorScreenFor, screenFor } from '@/lib/frame'

export { SCREEN_HEADER, screenFor }

/**
 * Session refresh only. THIS IS NOT THE SECURITY BOUNDARY.
 *
 * Server Components cannot write cookies, so something has to sit in front
 * of the request and persist a rotated refresh token. That is all this
 * does. The authorization decision — is there a valid signature, and is
 * this address on the allowlist — happens in requireOperator(), called
 * directly by every page and route that touches lead data.
 *
 * The reason for the split is not stylistic. Next.js middleware has been
 * bypassable by a crafted request header (CVE-2025-29927), and a check the
 * caller can skip is not a check. More generally it is rule 1 of the
 * lessons file: verify on the path the real caller takes. The real caller
 * of a Server Component is the render, not the proxy.
 *
 * The redirect below is a convenience so an expired session lands on the
 * login screen instead of a flash of empty page. Nothing depends on it.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return response

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  // Refreshes the token as a side effect, and verifies the signature.
  const { data } = await supabase.auth.getClaims()
  const signedIn = Boolean(data?.claims)

  const path = request.nextUrl.pathname

  // The PWA shell is public. iOS fetches the manifest and the icons outside
  // any session, so redirecting them to /login gives the home-screen app a
  // 6-byte body where its icon should be — which is how it was found. None
  // of these carry data: a name, two colours and a letter R.
  const isAsset =
    path === '/manifest.webmanifest' ||
    path === '/icon' ||
    path === '/apple-icon' ||
    path === '/favicon.ico'

  /*
   * Machine endpoints carry their OWN authentication and must not be
   * redirected to a login page.
   *
   * /api/listings/inbound is called by n8n with a shared secret and no cookie.
   * Without this it 307s to /login, which the caller's guard correctly reports
   * as a non-2xx — so the agent was told their listing had not been saved and
   * nothing was silently lost. It cost a round of diagnosis rather than a
   * defect, which is what asserting the response downstream buys you.
   *
   * Listed explicitly, one path at a time. `path.startsWith('/api')` would
   * exempt every future API route from auth by default, and the next one
   * added might not bring its own.
   *
   * /api/health is polled by the outside monitor (Better Stack) with a token
   * header and no cookie — improvements §3.7, Layer 3. It checks the token
   * before touching anything.
   */
  /*
   * 🔒 /api/alive joins them (23 Sep 2026) for the redirect reason above, not
   * because it is unauthenticated: it verifies the session itself and answers
   * 401. Routed through the redirect instead, a signed-out poll would follow
   * to /login and come back 200 — so a dead session would look alive, which is
   * precisely what that route exists to detect.
   */
  const isMachineEndpoint = path === '/api/listings/inbound' || path === '/api/health' || path === '/api/alive'

  const isPublic = isAsset || isMachineEndpoint || path.startsWith('/login') || path.startsWith('/auth')

  if (!signedIn && !isPublic) {
    const to = request.nextUrl.clone()
    to.pathname = '/login'
    to.search = ''
    return NextResponse.redirect(to)
  }

  /*
   * ── The client frames ──────────────────────────────────────────────────
   *
   * `/c/<client>/…` and `/p/<client>/…` resolve to a registered screen, and
   * the slug is put on a request header so the layout can tell the frame
   * which nav item is current.
   *
   * 🔴 THE HEADER IS COSMETIC, AND THE 404 BELOW IS DEFENCE IN DEPTH. Read
   * the top of this file: a check the caller can skip is not a check, and a
   * request header is exactly what CVE-2025-29927 let a caller forge. So the
   * refusal that matters — a screen that must never be shown to an agency —
   * is asserted again by assertPresentable() inside the page itself, on the
   * path the real caller takes. This only turns the obvious mistake into a
   * 404 before a render happens.
   */
  const frameMatch = screenFor(path)
  if (frameMatch && frameMatch.frame === 'p') {
    const screen = CLIENT_SCREENS.find((s) => s.slug === frameMatch.slug)
    if (!screen || !screen.presented) return new NextResponse(null, { status: 404 })
  }

  /*
   * 🔒 ONE PLACE THAT SETS THE HEADER, for both frames. The operator level
   * joined on 23 Sep 2026, when its six screens moved under a shared layout:
   * a layout is not given the pathname, so the slug has to arrive this way.
   * `''` is a real answer — a client LANDING — so this tests for null, not
   * for truthiness.
   */
  const slug = frameMatch ? frameMatch.slug : operatorScreenFor(path)
  if (slug !== null) {
    const headers = new Headers(request.headers)
    headers.set(SCREEN_HEADER, slug)
    // Rebuilt rather than mutated, so the cookie work above is preserved.
    const withScreen = NextResponse.next({ request: { headers } })
    for (const c of response.cookies.getAll()) withScreen.cookies.set(c)
    return withScreen
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
