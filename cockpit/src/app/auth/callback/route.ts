import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { isAllowed } from '@/lib/auth'

/**
 * Where a magic link lands.
 *
 * Handles BOTH shapes Supabase can send, because which one arrives depends
 * on the project's email template and getting it wrong looks identical to
 * a broken login:
 *
 *   ?code=...                        PKCE, the default template
 *   ?token_hash=...&type=magiclink   the {{ .TokenHash }} template
 *
 * The allowlist is enforced here as well as on every request. Supabase will
 * issue a session to any address that asks for a link, so without this an
 * unlisted person would hold a valid session cookie — harmless only for as
 * long as every downstream check is perfect. Sign them out at the door.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type')

  const cookieStore = await cookies()
  const response = NextResponse.redirect(new URL('/queue', url.origin))

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  let failed: string | null = null

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) failed = error.message
  } else if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({
      type: (type as 'magiclink' | 'email') ?? 'magiclink',
      token_hash: tokenHash,
    })
    if (error) failed = error.message
  } else {
    failed = 'The link carried no token. Request a new one.'
  }

  if (failed) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(failed)}`, url.origin),
    )
  }

  // Verify the signature rather than trusting the cookie we just wrote.
  const { data } = await supabase.auth.getClaims()
  const email = typeof data?.claims?.email === 'string' ? data.claims.email : undefined

  if (!isAllowed(email)) {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/login?denied=1', url.origin))
  }

  return response
}
