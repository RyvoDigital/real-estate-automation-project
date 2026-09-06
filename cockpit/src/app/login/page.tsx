import { redirect } from 'next/navigation'
import { isAllowed } from '@/lib/auth'
import { authClient } from '@/lib/supabase/server'
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
  const supabase = await authClient()

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
            Link sent. It is single-use and expires — open it on the device you want to be signed
            in on.
          </div>
        )}
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
