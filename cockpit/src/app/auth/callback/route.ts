import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { isAllowed } from '@/lib/auth'

/**
 * Where a magic link lands.
 *
 * THE FLOW IS token_hash, AND THAT IS A REQUIREMENT, NOT A PREFERENCE.
 *
 * Supabase can deliver a link in three shapes, and only one of them works
 * for the way this product is used:
 *
 *   ?token_hash=…&type=magiclink   verified server-side. STATELESS — nothing
 *                                  is stored on the requesting device, so the
 *                                  link opens on ANY device. This is ours.
 *
 *   ?code=…                        PKCE. Requires a code_verifier cookie in
 *                                  the browser that ASKED for the link. Open
 *                                  it on a different device and it fails with
 *                                  "code verifier not found in storage" — by
 *                                  construction, not by misconfiguration.
 *
 *   #access_token=…                implicit. The tokens are in the URL
 *                                  FRAGMENT, which browsers never send to the
 *                                  server, so this route sees no parameters
 *                                  at all.
 *
 * Requesting a link on a laptop and opening it on a phone is the normal
 * working pattern here — the escalation queue exists to be read between
 * viewings. An auth flow that only works in one browser fails in exactly the
 * situation the product is for. §11 item 17.
 *
 * The two failing shapes are therefore not handled, they are DIAGNOSED: each
 * one names the template that produced it, because the fix is in the Supabase
 * email template and a generic "login failed" would send you looking in the
 * wrong place. See cockpit/README.md for the template.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type')
  const code = url.searchParams.get('code')

  const deny = (msg: string) =>
    NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(msg)}`, url.origin))

  if (!tokenHash) {
    if (code) {
      return deny(
        'This link used the PKCE flow, which only works in the browser that ' +
          'requested it. The Supabase magic-link template must send ' +
          '{{ .TokenHash }} to /auth/callback instead.',
      )
    }
    return deny(
      'This link carried no token in its URL. That means the email template ' +
        'is still using the default {{ .ConfirmationURL }}, which returns the ' +
        'session in the URL fragment where a server cannot read it. Point the ' +
        'template at /auth/callback?token_hash={{ .TokenHash }}&type=magiclink.',
    )
  }

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
            response.cookies.set(name, value, {
              ...options,
              // The session is never read from JavaScript, so it has no business
              // being reachable by it. httpOnly closes XSS as a session-theft
              // route; secure keeps it off any plaintext hop.
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
            })
          }
        },
      },
    },
  )

  const { error } = await supabase.auth.verifyOtp({
    type: (type as 'magiclink' | 'email' | 'recovery') ?? 'magiclink',
    token_hash: tokenHash,
  })
  if (error) return deny(error.message)

  // Verify the signature rather than trusting the cookie just written.
  const { data } = await supabase.auth.getClaims()
  const email = typeof data?.claims?.email === 'string' ? data.claims.email : undefined

  if (!isAllowed(email)) {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/login?denied=1', url.origin))
  }

  return response
}
