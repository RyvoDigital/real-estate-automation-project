import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { isAllowed } from '@/lib/auth'
import { otpClient } from '@/lib/supabase/otp'
import { IconLock } from '@/components/Icons'

export const dynamic = 'force-dynamic'

async function sendLink(formData: FormData) {
  'use server'

  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase()

  // Refuse to send to an address that could not sign in anyway. This is a
  // courtesy, NOT the security boundary — the address is caller-supplied,
  // so the real gate is requireOperator() on every request. Both exist:
  // one stops a typo, the other stops an attacker.
  if (!email || !isAllowed(email)) {
    redirect('/login?denied=1')
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  // Not the SSR client: that one is PKCE, which pins the link to the browser
  // that asked for it. See lib/supabase/otp.ts.
  const supabase = otpClient()

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${site}/auth/callback`,
      // One operator, added by hand. Nobody signs themselves up.
      shouldCreateUser: true,
    },
  })

  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`)
  redirect('/login?sent=1')
}

/**
 * Sign in with the six-digit code from the same email.
 *
 * This exists because of an iOS platform behaviour, not a preference: a web
 * app added to the home screen has its OWN cookie jar, separate from
 * Safari's. A magic link tapped in Mail always opens Safari, so the session
 * it creates lands in the wrong jar and the installed app still shows the
 * login screen — which is exactly what "I closed the tab and had to sign in
 * again" looks like from the outside.
 *
 * A code can be typed INSIDE the installed app, so the session is created in
 * the jar that will be used. It also avoids two contexts racing to rotate the
 * same refresh token, which logs one of them out.
 */
async function enterCode(formData: FormData) {
  'use server'

  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const token = String(formData.get('code') ?? '').replace(/\D/g, '')

  if (!isAllowed(email)) redirect('/login?denied=1')
  if (token.length < 6) redirect('/login?error=' + encodeURIComponent('That code is too short.'))

  const cookieStore = await cookies()
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
            cookieStore.set(name, value, {
              ...options,
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
            })
          }
        },
      },
    },
  )

  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
  if (error) redirect('/login?error=' + encodeURIComponent(error.message))

  redirect('/queue')
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; denied?: string; error?: string }>
}) {
  const params = await searchParams

  return (
    <div className="login">
      <div className="login__box">
        <div className="nav__mark">R</div>
        <h1 className="login__title">Ryvo Cockpit</h1>
        <p className="login__sub">
          Internal. A one-time link is sent to addresses on the allowlist; there is no password
          and no sign-up.
        </p>

        <form action={sendLink}>
          <input
            className="field"
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="you@ryvodigital.com"
            aria-label="Email address"
          />
          <button className="btn" type="submit">
            Send me a link
          </button>
        </form>

        {params.sent && (
          <div className="notice notice--ok">
            Sent. The email carries both a link and a six-digit code.
          </div>
        )}

        <div className="login__or">
          <span />
          <span>or enter the code</span>
          <span />
        </div>

        {/* On a home-screen app, use the code. iOS gives the installed app its
            own cookie jar and a tapped link always opens Safari, so a link
            signs you into the wrong one. */}
        <form action={enterCode} className="login__code">
          <input
            className="field"
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="you@ryvodigital.com"
            aria-label="Email address for the code"
          />
          <input
            className="field"
            type="text"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={8}
            required
            placeholder="123456"
            aria-label="Six-digit code"
          />
          <button className="btn btn--ghost" type="submit">
            Sign in with code
          </button>
        </form>
        {params.denied && (
          <div className="notice notice--bad">
            That address is not on the allowlist, so no link was sent.
          </div>
        )}
        {params.error && <div className="notice notice--bad">{params.error}</div>}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 20,
            fontSize: 11.5,
            color: 'var(--ink-4)',
          }}
        >
          <IconLock size={13} />
          <span>This screen shows prospects&rsquo; personal data once you are through it.</span>
        </div>
      </div>
    </div>
  )
}
