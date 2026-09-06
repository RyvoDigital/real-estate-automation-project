import 'server-only'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * The auth client. Uses the ANON key and the caller's own session cookies,
 * so it can do exactly one useful thing: tell us who is asking.
 *
 * It reads no data. RLS is deny-by-default with zero policies, so the anon
 * key returns nothing from any table — data access goes through admin()
 * after the caller has been checked.
 */
export async function authClient() {
  const cookieStore = await cookies()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  if (!key) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set')

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, {
              ...options,
              // The session is never read from JavaScript, so it has no business
              // being reachable by it. httpOnly closes XSS as a session-theft
              // route; secure keeps it off any plaintext hop.
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
            })
          }
        } catch {
          // Server Components cannot write cookies. The proxy refreshes the
          // session, so this throw is expected and safe to swallow HERE and
          // only here — swallowing it in a route handler would silently drop
          // a rotated refresh token.
        }
      },
    },
  })
}
