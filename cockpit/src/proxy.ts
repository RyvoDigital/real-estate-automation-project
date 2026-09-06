import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

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

  const isPublic = isAsset || path.startsWith('/login') || path.startsWith('/auth')

  if (!signedIn && !isPublic) {
    const to = request.nextUrl.clone()
    to.pathname = '/login'
    to.search = ''
    return NextResponse.redirect(to)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
