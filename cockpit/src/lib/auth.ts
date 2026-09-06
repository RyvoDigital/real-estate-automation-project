import 'server-only'

import { redirect } from 'next/navigation'
import { authClient } from '@/lib/supabase/server'

/**
 * Who is allowed to hold a session.
 *
 * Supabase magic-link auth will happily issue a session to ANY address that
 * asks for one. Restricting the login form is cosmetic — the address is
 * attacker-controlled. This list is the actual door, and it is checked on
 * every request rather than once at sign-in.
 *
 * An unset or empty list throws rather than defaulting to "allow all".
 * §1c of the lessons file: prefer a config that refuses to start over one
 * that starts wrong. A cockpit serving leads to everyone is the quiet,
 * expensive failure; a page that will not render is a loud, cheap one.
 */
export function allowedEmails(): string[] {
  const raw = process.env.COCKPIT_ALLOWED_EMAILS ?? ''
  const list = raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)

  if (list.length === 0) {
    throw new Error(
      'COCKPIT_ALLOWED_EMAILS is empty. Refusing to serve rather than ' +
        'defaulting to an open cockpit. Set it to a comma-separated list.',
    )
  }
  return list
}

export function isAllowed(email: string | undefined | null): boolean {
  if (!email) return false
  return allowedEmails().includes(email.trim().toLowerCase())
}

export type Operator = { email: string; sub: string }

/**
 * Establish who is asking, or send them to the door.
 *
 * Uses getClaims(), which verifies the JWT signature against the project's
 * published keys. getSession() reads the cookie without revalidating, so it
 * is not an authorization primitive however convenient it looks.
 *
 * THIS is the security boundary, not the proxy in middleware.ts. Next.js
 * middleware has been bypassable by a request header before now, and a
 * check that can be skipped by the caller is not a check. Every route that
 * touches lead data calls this directly.
 */
export async function requireOperator(): Promise<Operator> {
  const supabase = await authClient()
  const { data, error } = await supabase.auth.getClaims()

  const claims = data?.claims
  const email = typeof claims?.email === 'string' ? claims.email : undefined

  if (error || !claims || !email) redirect('/login')
  if (!isAllowed(email)) redirect('/login?denied=1')

  return { email, sub: String(claims.sub) }
}
